const expectedMajor = 20;
const actualMajor = Number(process.versions.node.split('.')[0]);

if (actualMajor !== expectedMajor) {
  console.error(
    `Together-Release-Checks benötigen Node ${expectedMajor}. Aktiv ist Node ${process.versions.node}. ` +
      'Installiere oder aktiviere Node 20 (siehe .nvmrc) und starte den Check erneut.',
  );
  process.exit(1);
}

console.log(`Node ${process.versions.node} entspricht dem Release-Standard.`);
