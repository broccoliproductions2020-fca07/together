# Native Firebase configuration files

`app.config.js` selects the native Firebase identity from `APP_VARIANT`:

| Variant | Folder | Android package | iOS bundle id | Firebase target |
| --- | --- | --- | --- | --- |
| `development` | `dev/` | `com.broccolistudio.together.dev` | `com.broccolistudio.together.dev` | Local Emulator Suite at runtime |
| `staging` | `staging/` | `com.broccolistudio.together.staging` | `com.broccolistudio.together.staging` | Firebase development project |
| `production` | `prod/` | `com.broccolistudio.together` | `com.broccolistudio.together` | Firebase production project |

Each folder needs these untracked Firebase Console downloads without renaming:

```text
google-services.json
GoogleService-Info.plist
```

For EAS staging and production builds, provide the same files as the secret file
variables `GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICE_INFO_PLIST`. Empty values
are ignored; missing configuration fails the build rather than falling back to
another project.

Maps SDK keys come from the build environment and must be restricted by Android
package/signing certificate or iOS bundle id. Never commit keys or Firebase
service files.
