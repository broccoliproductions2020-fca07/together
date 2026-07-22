import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Image, StyleSheet, View, type ImageProps } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * Image-based marker workaround for the react-native-maps Android clipping bug.
 *
 * On the New Architecture (Fabric), custom marker Views handed to `<Marker>` are
 * snapshotted to a bitmap before layout settles and end up clipped to their
 * top-left corner (the "avatar only half visible" bug — reproduced even in a
 * real dev client, so it is NOT an Expo Go quirk). The fix is to render each
 * marker off-screen in a normal view tree (where layout works correctly),
 * capture it to a PNG with react-native-view-shot, and hand THAT to the
 * `<Marker image>` prop — which bypasses the buggy view→bitmap path entirely.
 *
 * Captures are cached by a `captureKey` that encodes the marker's full visual
 * state (mode, initials, badges…), so panning/zooming never re-captures and an
 * appearance change (join, unread…) produces a fresh image on demand.
 */

/** Bounded image cache: enough for every marker's recent states without ever
 * growing unbounded over a long session. Images that are still some marker's
 * latest fallback are never evicted. */
const MAX_CACHED_MARKER_IMAGES = 120;

export interface CaptureRequest {
  /** Stable map-marker identity. Keeps the previous image visible while a
   * changed visual state is captured asynchronously. */
  markerId: string;
  /** Encodes the full visual state; identical keys reuse the same image. */
  captureKey: string;
  node: ReactNode;
}

interface MarkerImages {
  /** Captured file uris, keyed by captureKey. */
  uris: Record<string, string>;
  /** Returns the current image, or the last completed image for this marker
   * while its next visual state is still being captured. */
  imageUriFor: (markerId: string, captureKey: string) => string | undefined;
  /** Renders the hidden off-screen capture layer for any not-yet-captured keys. */
  renderCaptureLayer: (requests: CaptureRequest[]) => ReactNode;
}

interface CacheState {
  /** captureKey → file uri. */
  uris: Record<string, string>;
  /** markerId → last completed uri (fallback while a new state captures). */
  latest: Record<string, string>;
  /** captureKeys in insertion order — drives eviction. */
  order: string[];
}

export function useMarkerImages(): MarkerImages {
  const [cache, setCache] = useState<CacheState>({ uris: {}, latest: {}, order: [] });

  const handleCaptured = useCallback((markerId: string, key: string, uri: string) => {
    setCache((prev) => {
      if (prev.uris[key]) {
        // A concurrent capture of the same key won the race — keep the first
        // image, only refresh the marker's latest pointer.
        return prev.latest[markerId] === prev.uris[key]
          ? prev
          : { ...prev, latest: { ...prev.latest, [markerId]: prev.uris[key] } };
      }
      const uris = { ...prev.uris, [key]: uri };
      const latest = { ...prev.latest, [markerId]: uri };
      const order = [...prev.order, key];
      const inUse = new Set(Object.values(latest));
      while (order.length > MAX_CACHED_MARKER_IMAGES) {
        const evictable = order.findIndex((candidate) => !inUse.has(uris[candidate]));
        if (evictable === -1) break;
        const [evicted] = order.splice(evictable, 1);
        delete uris[evicted];
      }
      return { uris, latest, order };
    });
  }, []);

  const imageUriFor = useCallback(
    (markerId: string, captureKey: string) => cache.uris[captureKey] ?? cache.latest[markerId],
    [cache],
  );

  const renderCaptureLayer = useCallback(
    (requests: CaptureRequest[]) => {
      // Only capture keys we don't have yet, de-duplicated.
      const seen = new Set<string>();
      const pending = requests.filter((request) => {
        if (cache.uris[request.captureKey] || seen.has(request.captureKey)) return false;
        seen.add(request.captureKey);
        return true;
      });

      if (pending.length === 0) return null;

      return (
        <View style={styles.hidden} pointerEvents="none">
          {pending.map((request) => (
            <MarkerCapturer
              key={request.captureKey}
              markerId={request.markerId}
              captureKey={request.captureKey}
              onCaptured={handleCaptured}
            >
              {request.node}
            </MarkerCapturer>
          ))}
        </View>
      );
    },
    [cache.uris, handleCaptured],
  );

  return { uris: cache.uris, imageUriFor, renderCaptureLayer };
}

interface CaptureReadiness {
  /** Registers one pending async asset; the returned function marks it ready
   * (idempotent — safe to call from both onLoadEnd and unmount cleanup). */
  register: () => () => void;
}

const CaptureReadinessContext = createContext<CaptureReadiness | null>(null);

/**
 * Drop-in `Image` for marker components. During an off-screen capture it holds
 * the snapshot back until the image has actually painted — a plain `Image`
 * with a remote uri (e.g. a Firebase Storage avatar) can otherwise be
 * photographed blank, and the blank PNG would stay cached until some other
 * visual state changes. Outside a capture context it behaves exactly like
 * `Image`.
 */
export function MarkerImage(props: ImageProps) {
  const readiness = useContext(CaptureReadinessContext);
  const doneRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!readiness) return;
    const done = readiness.register();
    doneRef.current = done;
    return () => {
      doneRef.current = null;
      done();
    };
  }, [readiness]);

  return (
    <Image
      {...props}
      onLoadEnd={() => {
        doneRef.current?.();
        props.onLoadEnd?.();
      }}
    />
  );
}

/** Never block a capture forever on an asset that fails to load. */
const CAPTURE_FALLBACK_MS = 1500;
const CAPTURE_RETRY_MS = 500;

/**
 * Renders one marker off-screen and captures it to a PNG once its layout has
 * settled AND every registered `MarkerImage` has painted (two extra frames so
 * the last paint lands before the snapshot). All callbacks must stay
 * identity-stable across parent re-renders — a changing readiness context
 * would re-register already-loaded images, whose load event never fires
 * again, and every capture would stall into the fallback timeout.
 */
function MarkerCapturer({
  children,
  markerId,
  captureKey,
  onCaptured,
}: {
  children: ReactNode;
  markerId: string;
  captureKey: string;
  onCaptured: (markerId: string, captureKey: string, uri: string) => void;
}) {
  const ref = useRef<View>(null);
  const layoutDone = useRef(false);
  const pendingAssets = useRef(0);
  const capturing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const capture = useCallback(() => {
    if (capturing.current) return;
    capturing.current = true;
    if (timer.current) clearTimeout(timer.current);
    requestAnimationFrame(() =>
      requestAnimationFrame(async () => {
        // An asset may have registered between scheduling and this frame —
        // back off and let its completion (or the fallback timer) re-trigger.
        if (pendingAssets.current > 0) {
          capturing.current = false;
          timer.current = setTimeout(capture, CAPTURE_FALLBACK_MS);
          return;
        }
        try {
          const uri = await captureRef(ref, {
            format: 'png',
            quality: 1,
            result: 'tmpfile',
          });
          onCaptured(markerId, captureKey, uri);
        } catch {
          // A failed capture just means the marker stays hidden this pass —
          // retry shortly instead of waiting for a state change.
          capturing.current = false;
          timer.current = setTimeout(capture, CAPTURE_RETRY_MS);
        }
      }),
    );
  }, [onCaptured, markerId, captureKey]);

  const maybeCapture = useCallback(() => {
    if (layoutDone.current && pendingAssets.current === 0) capture();
  }, [capture]);

  const readiness = useMemo<CaptureReadiness>(
    () => ({
      register: () => {
        pendingAssets.current += 1;
        let called = false;
        return () => {
          if (called) return;
          called = true;
          pendingAssets.current -= 1;
          maybeCapture();
        };
      },
    }),
    [maybeCapture],
  );

  useEffect(() => {
    timer.current = setTimeout(capture, CAPTURE_FALLBACK_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [capture]);

  return (
    <CaptureReadinessContext.Provider value={readiness}>
      <View
        ref={ref}
        collapsable={false}
        onLayout={() => {
          layoutDone.current = true;
          maybeCapture();
        }}
      >
        {children}
      </View>
    </CaptureReadinessContext.Provider>
  );
}

const styles = StyleSheet.create({
  hidden: {
    // Fully rendered (opacity 1) but pushed far off-screen so it never shows;
    // captureRef draws it to a canvas, which does not require on-screen
    // visibility. (opacity:0 can capture blank on some devices — offset is safer.)
    left: -10000,
    position: 'absolute',
    top: 0,
  },
});
