const { assertFullDeployIsSafe } = require('./functions-deploy-safety.cjs');

// The safe wrapper has already validated its scope. A direct Firebase CLI
// Functions deploy has no such proof, so treat it as a full deploy and block
// it whenever the cloud contains Function exports absent from local source.
const scope = process.env.TOGETHER_FUNCTIONS_DEPLOY_SCOPE;
if (scope === 'targeted' || scope === 'checked-full') {
  console.log(`Functions predeploy guard: approved ${scope} deployment.`);
} else {
  try {
    assertFullDeployIsSafe(process.env.GCLOUD_PROJECT);
  } catch (error) {
    console.error(`\n${error.message}`);
    process.exitCode = 1;
  }
}
