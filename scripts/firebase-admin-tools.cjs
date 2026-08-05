const path = require('path');
const { createRequire } = require('module');

const functionsRequire = createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const adminPackage = (subpath) => functionsRequire(`firebase-admin/${subpath}`);

const { initializeApp: initializeAdminApp, refreshToken } = adminPackage('app');
const { getAuth } = adminPackage('auth');
const { getDatabase } = adminPackage('database');
const { FieldPath, FieldValue, getFirestore, Timestamp } = adminPackage('firestore');
const { getStorage } = adminPackage('storage');

function initializeApp(options, name) {
  const app = initializeAdminApp(options, name);
  return {
    auth: () => getAuth(app),
    database: () => getDatabase(app),
    storage: () => getStorage(app),
    delete: () => app.delete(),
    firestore: () => getFirestore(app),
  };
}

module.exports = {
  credential: { refreshToken },
  initializeApp,
  firestore: { FieldPath, FieldValue, Timestamp },
};
