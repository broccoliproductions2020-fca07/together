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
process.env.FIREBASE_STORAGE_EMULATOR_HOST = `127.0.0.1:${storagePort}`;
const admin = require('./firebase-admin-tools.cjs');
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

  const small = bytes(1024);
  const adminApp = admin.initializeApp(
    { projectId: config.projectId, storageBucket: config.storageBucket },
    'storage-rules-seed',
  );
  const bucket = adminApp.storage().bucket();
  const legacyPath = `avatars/${aUid}.jpg`;
  const versionedPath = `avatars/${aUid}/0123456789abcdef0123456789abcdef.jpg`;
  await Promise.all([
    bucket.file(legacyPath).save(Buffer.from(small), { metadata: { contentType: 'image/jpeg' } }),
    bucket
      .file(versionedPath)
      .save(Buffer.from(small), { metadata: { contentType: 'image/jpeg' } }),
  ]);

  await allowed('owner can read own legacy avatar', () => getBytes(ref(a.storage, legacyPath)));
  await allowed('owner can read own versioned avatar', () =>
    getBytes(ref(a.storage, versionedPath)),
  );
  await denied("other user cannot read someone else's avatar", () =>
    getBytes(ref(b.storage, versionedPath)),
  );
  await denied('owner cannot directly upload an avatar', () =>
    uploadBytes(ref(a.storage, versionedPath), small, { contentType: 'image/jpeg' }),
  );
  await denied("owner cannot upload under another uid's filename", () =>
    uploadBytes(ref(a.storage, `avatars/${bUid}/0123456789abcdef0123456789abcdef.jpg`), small, {
      contentType: 'image/jpeg',
    }),
  );
  await denied('path outside avatars/ is fully denied', () =>
    uploadBytes(ref(a.storage, `profile-pics/${aUid}.jpg`), small, { contentType: 'image/jpeg' }),
  );
  await denied('unauthenticated cannot read an avatar', () =>
    getBytes(ref(anon.storage, versionedPath)),
  );
  await denied('unauthenticated cannot upload an avatar', () =>
    uploadBytes(ref(anon.storage, versionedPath), small, { contentType: 'image/jpeg' }),
  );
  await denied('owner cannot directly delete an avatar', () =>
    deleteObject(ref(a.storage, versionedPath)),
  );
  await denied("other user cannot delete someone else's avatar", () =>
    deleteObject(ref(b.storage, versionedPath)),
  );
  await adminApp.delete();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
