const { initializeApp } = require('firebase/app');
const { connectAuthEmulator, getAuth, signInAnonymously } = require('firebase/auth');
const {
  connectStorageEmulator,
  deleteObject,
  getBytes,
  getStorage,
  ref,
  uploadBytes,
} = require('firebase/storage');

const authPort = Number(process.env.TEST_AUTH_EMULATOR_PORT ?? 9099);
const storagePort = Number(process.env.TEST_STORAGE_EMULATOR_PORT ?? 9198);
const config = {
  apiKey: 'demo',
  authDomain: 'demo-together.local',
  projectId: 'demo-together',
  storageBucket: 'demo-together.appspot.com',
};

function client(name) {
  const app = initializeApp(config, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
  const storage = getStorage(app);
  connectStorageEmulator(storage, '127.0.0.1', storagePort);
  return { auth, storage };
}

function bytes(size) {
  return new Uint8Array(size).fill(1);
}

async function denied(label, operation) {
  try {
    await operation();
    throw new Error(`${label}: expected PERMISSION_DENIED`);
  } catch (error) {
    if (error.message.startsWith(`${label}: expected`)) throw error;
    console.log(`DENIED ${label}`);
  }
}

async function allowed(label, operation) {
  await operation();
  console.log(`ALLOWED ${label}`);
}

async function main() {
  const a = client('storage-a');
  const b = client('storage-b');
  // Never signed in — represents an unauthenticated caller.
  const anon = client('storage-anon');
  const aCredential = await signInAnonymously(a.auth);
  const bCredential = await signInAnonymously(b.auth);
  const aUid = aCredential.user.uid;
  const bUid = bCredential.user.uid;

  const validJpeg = { contentType: 'image/jpeg' };
  const small = bytes(1024);
  const oversized = bytes(6 * 1024 * 1024);

  await allowed('owner can upload own avatar', () =>
    uploadBytes(ref(a.storage, `avatars/${aUid}.jpg`), small, validJpeg),
  );
  await allowed('owner can read own avatar', () => getBytes(ref(a.storage, `avatars/${aUid}.jpg`)));
  await denied("other user cannot read someone else's avatar", () =>
    getBytes(ref(b.storage, `avatars/${aUid}.jpg`)),
  );
  await denied("owner cannot upload under another uid's filename", () =>
    uploadBytes(ref(a.storage, `avatars/${bUid}.jpg`), small, validJpeg),
  );
  await denied('oversized avatar (>5 MB) is rejected', () =>
    uploadBytes(ref(a.storage, `avatars/${aUid}.jpg`), oversized, validJpeg),
  );
  await denied('wrong content type is rejected', () =>
    uploadBytes(ref(a.storage, `avatars/${aUid}.jpg`), small, { contentType: 'image/png' }),
  );
  await denied('path outside avatars/ is fully denied', () =>
    uploadBytes(ref(a.storage, `profile-pics/${aUid}.jpg`), small, validJpeg),
  );
  await denied('unauthenticated cannot read an avatar', () =>
    getBytes(ref(anon.storage, `avatars/${aUid}.jpg`)),
  );
  await denied('unauthenticated cannot upload an avatar', () =>
    uploadBytes(ref(anon.storage, `avatars/${aUid}.jpg`), small, validJpeg),
  );
  await allowed('owner can delete own avatar', () => deleteObject(ref(a.storage, `avatars/${aUid}.jpg`)));
  // Recreate it so the next case has something to deny a delete against.
  await uploadBytes(ref(a.storage, `avatars/${aUid}.jpg`), small, validJpeg);
  await denied("other user cannot delete someone else's avatar", () =>
    deleteObject(ref(b.storage, `avatars/${aUid}.jpg`)),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
