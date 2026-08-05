# Firebase staging configuration

This variant is intentionally not committed. In the existing Firebase Dev
project, create separate apps for these identifiers:

- Android: `com.broccolistudio.together.staging`
- iOS: `com.broccolistudio.together.staging`

Download their native files locally as:

```text
firebase/native/staging/google-services.json
firebase/native/staging/GoogleService-Info.plist
```

For EAS, configure the same files as secret file variables named
`GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICE_INFO_PLIST` in the `preview`
environment. `.gitignore` keeps the files outside Git.
