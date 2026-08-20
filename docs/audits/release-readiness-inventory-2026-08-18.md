# Release-readiness inventory · 2026-08-18

Generated at 2026-08-18T13:53:28.865Z from the current Dev/Staging worktree.

Reproduce from the repository root:

```powershell
node docs/audits/tools/generate-release-readiness-inventory.mjs 2026-08-18
```

Total inventoried productive/configuration units: **496**. Generated audit artifacts, vendor trees, build outputs and design prototypes are excluded.

The SHA-256 column pins this audit to the exact executable/configuration state. “Git” is the working-tree state at generation time; `clean` means no path-local change was reported.

## Area summary

| Area | Units |
| --- | ---: |
| Android native project | 55 |
| Build / seed / release tooling | 23 |
| CI / release automation | 4 |
| Client module | 44 |
| Cloud Functions | 5 |
| Components / UI | 106 |
| Configuration / dependencies | 19 |
| Domain / data models | 16 |
| Firestore indexes | 1 |
| Firestore Rules | 1 |
| Hooks | 17 |
| Legal content | 4 |
| Local operations tooling | 7 |
| Native Firebase identities | 8 |
| Providers / context | 17 |
| Routes / navigation | 9 |
| RTDB Rules | 1 |
| Runtime assets | 27 |
| Screens | 11 |
| Selectors / utilities | 39 |
| Services / Firebase seams | 47 |
| Sheets / modals | 20 |
| Storage Rules | 1 |
| Tests | 14 |

## Android native project

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| android/.gitignore | binary | 129 | clean | 03263c9a1436e264a87c6e0547007488dc980efb2326724b5a85c0835bac34a7 |
| android/app/build.gradle | 186 | 8263 | clean | fc900f4a1252cce3bade9318530233a484d74ca3cceec78ce210de1b8ae32fca |
| android/app/debug.keystore | binary | 2257 | clean | 221e0a3106aa4c3ccc154e0a418b55020b3f9ea6e84f92e8749cd9e2f39f5e58 |
| android/app/google-services.json | 31 | 790 | clean | 4abc63f5363e79c5831e00a39ac149ed800cb0676515989f5947928f01ba5348 |
| android/app/proguard-rules.pro | binary | 562 | clean | 8bd4d7b69a1d78e8322b459b5e8d48234adce7481df04da34c0140d52ffb367a |
| android/app/src/debug/AndroidManifest.xml | 8 | 374 | clean | fb1795032c764d975376e1612ab7022058eca2268a45efbe731a47a5d3ac0f60 |
| android/app/src/debugOptimized/AndroidManifest.xml | 8 | 374 | clean | fb1795032c764d975376e1612ab7022058eca2268a45efbe731a47a5d3ac0f60 |
| android/app/src/main/AndroidManifest.xml | 42 | 3076 | clean | 9f70ced24b615e1d7f836423aad76237d450823d12775178cf221c5d1273e046 |
| android/app/src/main/java/com/broccolistudio/together/dev/MainActivity.kt | binary | 2466 | clean | 32a2689e5c3cf7d78b67a5ed7a624e2f36007b68deb1dceab102eb696aa12404 |
| android/app/src/main/java/com/broccolistudio/together/dev/MainApplication.kt | binary | 2044 | clean | 7affb9eb575f13760afc93bd0cca5802c11d2b3e26210f92aec63a9ef2a61cbd |
| android/app/src/main/res/drawable-hdpi/splashscreen_logo.png | binary | 10239 | clean | 06092cd8fb971bb3816efb690f72f4fcddf50251301d024bd50b0484b8e3827c |
| android/app/src/main/res/drawable-mdpi/splashscreen_logo.png | binary | 5994 | clean | 679a891f635ab624971cf8bf4f3edc6449574b9d595270281307d924b21432d1 |
| android/app/src/main/res/drawable-xhdpi/splashscreen_logo.png | binary | 16062 | clean | 4ef0846ca732603db43b31aaf61fb83d220bba56d3ea05b01dfcd92428fa3eea |
| android/app/src/main/res/drawable-xxhdpi/splashscreen_logo.png | binary | 31639 | clean | d4c5c0b77666e87d1962f9d448bef16241bd53f170eb938564a67cbac13cf5fe |
| android/app/src/main/res/drawable-xxxhdpi/splashscreen_logo.png | binary | 50580 | clean | 29d9bd3906b76e35e50bf1746f26936e1c0dcccd3ba3c04987ad629174c09116 |
| android/app/src/main/res/drawable/ic_launcher_background.xml | 6 | 245 | clean | 51fca95679d075ddbe2b9fe7ad2efb5ef545c5770a9ad6cafe8bf610c18c67be |
| android/app/src/main/res/drawable/rn_edit_text_material.xml | 38 | 1917 | clean | 738e3aaad53180caba1419a6d5db8465a0742662fe59a4bbaf05f1061cbc3390 |
| android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml | 6 | 334 | clean | 4695650219221a8a70d9aa16e683ddfc6587c52ebb465aa43508c94bc9fd6d34 |
| android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml | 6 | 334 | clean | 4695650219221a8a70d9aa16e683ddfc6587c52ebb465aa43508c94bc9fd6d34 |
| android/app/src/main/res/mipmap-hdpi/ic_launcher_background.webp | binary | 8123 | clean | 09a6b4c68dda5a581da7387b530a55df648d59d562b103a59b679e81075861b8 |
| android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.webp | binary | 1644 | clean | 1bccbf7e6e8b43b2911e1f35aeed5c4e3704a452ef704225668afaa6c0314997 |
| android/app/src/main/res/mipmap-hdpi/ic_launcher_monochrome.webp | binary | 1329 | clean | 9569006f30452532eea29895810f76c412417ee4652d206a7f057f18f30714bf |
| android/app/src/main/res/mipmap-hdpi/ic_launcher_round.webp | binary | 4394 | clean | 3fb8bd52a9ef83a05971f27755949b7b91c6bd39dadb107da7722e7f3531e991 |
| android/app/src/main/res/mipmap-hdpi/ic_launcher.webp | binary | 3706 | clean | 2e2f426352a990b44b3c24ff008cc43515130b4828f30f43f4d2aed7ae49ed18 |
| android/app/src/main/res/mipmap-mdpi/ic_launcher_background.webp | binary | 4965 | clean | f6618de5d63be3c60e628c59457cb5cc2b20de320bb2b53c12fac4fd6e23aad2 |
| android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.webp | binary | 982 | clean | 5c87c5c04279507c8c02414cb56c6f743bc88a006925f804d9cc773c3d4d21b7 |
| android/app/src/main/res/mipmap-mdpi/ic_launcher_monochrome.webp | binary | 814 | clean | 2ba8a12ce40d65f9020ae7a319d40fb34e294f652b770a08c7a6d45f82f8f1bf |
| android/app/src/main/res/mipmap-mdpi/ic_launcher_round.webp | binary | 2745 | clean | 45966a2ca3f4cc5f207a3951211673060d64f21ceb8161845b960fbf1b10a498 |
| android/app/src/main/res/mipmap-mdpi/ic_launcher.webp | binary | 2183 | clean | 2349e4914291b8658035228b2350121c8251d4af928ac185d1323c4b086cd7d9 |
| android/app/src/main/res/mipmap-xhdpi/ic_launcher_background.webp | binary | 11743 | clean | d55ed6f7dab33d4edcf1a1998e6ac038469fd4ecdeac8945510991aa2f2f8e00 |
| android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.webp | binary | 2137 | clean | d26ae258a39aeb23742c9c1c0ba65b5ce30c9664d98aa32bf2186a607b3d9967 |
| android/app/src/main/res/mipmap-xhdpi/ic_launcher_monochrome.webp | binary | 1630 | clean | 7873421bdcde1069b527a028b8255ce27841073ed67546668d513e4f00d4da6f |
| android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.webp | binary | 6307 | clean | 8754bac3d7796cf95f3a164773079dded4c9caf52fbf9161966454aa822f9b67 |
| android/app/src/main/res/mipmap-xhdpi/ic_launcher.webp | binary | 5409 | clean | 9ac8e93a0d08f732f362cc45d6866e8b3651b88da9dfc72da3c64b6c262b47e3 |
| android/app/src/main/res/mipmap-xxhdpi/ic_launcher_background.webp | binary | 17882 | clean | 0f4a80ad1c3eafdc94b55028f4f56866912b67d5647c7631996bdfe7a1c9e582 |
| android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.webp | binary | 3523 | clean | a55a2b5faa309248ea74f398eae3eb20a36f3278baa410f73af4943d6ab8b708 |
| android/app/src/main/res/mipmap-xxhdpi/ic_launcher_monochrome.webp | binary | 2945 | clean | 4798b306b6142374a0de4c720694375bedfca3ec344bac1e386f11aaf4b9bae5 |
| android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.webp | binary | 10066 | clean | 4d6d3f59d23752abc045471dc7bb2a8ac63859026298749db982aa04a55504b4 |
| android/app/src/main/res/mipmap-xxhdpi/ic_launcher.webp | binary | 8826 | clean | adb416c25a12334ac5d0c0cf870a05ea9b787426383ea0ab51051fb564ad8ebe |
| android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_background.webp | binary | 26018 | clean | 2f693d83018fe4702756e3f3d42d7b9d3838d7b7417e80f473620ad9113c2d1f |
| android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.webp | binary | 5181 | clean | 3d2a31380495b82cdac9a1d181727b5a566aa57b167d17b91564420b0995827a |
| android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_monochrome.webp | binary | 3534 | clean | 30a373293d3c719415c1a119ee00985369b76ebbfb04973af3674ddc136c4b22 |
| android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.webp | binary | 14044 | clean | 3dcc31cfcd6797c1e1d917fb413c8bd7ec4331556877f9e8cf1616c062c854ea |
| android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.webp | binary | 12049 | clean | 955bcd4a79dad7157f472db5ec6280663aff275ee72a91a03b03079a7bc15fa9 |
| android/app/src/main/res/values-night/colors.xml | 1 | 12 | clean | c30a9f37e6b34372e1db8c812d64a18719acf7c52c11ff2f7e5e5ed5e05c2072 |
| android/app/src/main/res/values/colors.xml | 6 | 221 | clean | b8e6e807d733090ad03ed4b850cb7f4eb63adbaa8f27cc4c9c7e5a2475bf2867 |
| android/app/src/main/res/values/strings.xml | 7 | 399 | clean | 44118257662241b145a53f4faf723117d09067eb7e94c3b1a7f6f64b08d09e5b |
| android/app/src/main/res/values/styles.xml | 14 | 818 | clean | 2df6932530323c9dad4c9593cbcc81e2d541d123281e8089296b6da9c68e3f56 |
| android/build.gradle | 27 | 679 | clean | 0c709da59b4afce26958e3bab4576629d105ee017957242bf2c1eb912686a17e |
| android/gradle.properties | binary | 2836 | clean | 815512557a44f1e92bf4e2c139a0017e4e0c00fbfc7a60d7b777a4f0fa4ae765 |
| android/gradle/wrapper/gradle-wrapper.jar | binary | 43764 | clean | 7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172 |
| android/gradle/wrapper/gradle-wrapper.properties | binary | 253 | clean | 7e0821d895908883350587c74476b717016ab416320c44dc82a10def916c6fb5 |
| android/gradlew | binary | 8744 | clean | ee038d6f6b21501d34c5eac442aad930fd6b82191f9bb00f1780cc101ca14a68 |
| android/gradlew.bat | binary | 2937 | clean | 1d297e00bd21de3ace22b4d7f2de1f9dfa858883d66bbf7c1ccbecccec8f4f3b |
| android/settings.gradle | 40 | 1265 | clean | dc555793ed977c4c7972d461b024f6f002a83046635fef62e353cb4d6d853dbf |

## Build / seed / release tooling

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| scripts/assert-release-tag.cjs | 18 | 565 | clean | 135a662b63c0c32b29b87c199a2e8c5b77a09bcb6781506251c6e5cb8390bb05 |
| scripts/backfill-activity-visible-until.mjs | 121 | 3920 | clean | e86ccc5c2c2dfa3bceb69e5402cb323875d5bb2b39b3200ff213bc8e87d68967 |
| scripts/backfill-friend-search.mjs | 74 | 2516 | ?? | eab6f49737557baa9bbfe3871c17b119b8b0b8401b8ce6d7076f70a816c7be0a |
| scripts/build-android-devclient.ps1 | 43 | 1850 | clean | bac4975247162c19fe27062de92078671f12b74940544d16b24bd909cd1c0df2 |
| scripts/check-node-version.cjs | 13 | 448 | clean | 868677a1122ebf94060061415adc93e51eb06cec7dec093cf5f410ebff5b5fb1 |
| scripts/download-deployed-functions-source.cjs | 115 | 3901 | clean | f3e3fcd4f5845dc6cfb4d4d75ea457abcb2c2ff7a581f28f45350610e1f507e5 |
| scripts/emulators.js | 46 | 1817 | clean | 926720759b8e1f2d8aa45dde65e3447aff401a771e5ac3139dda44eb0f1aa72f |
| scripts/evaluate-activity-embeddings.mjs | 868 | 43693 | clean | b3406add8ded897d130d23ea3f1c4d9b3281245be9bd1683cec78db75a52f6e6 |
| scripts/firebase-admin-tools.cjs | 29 | 1009 | M | 6a206a24964f1eee56e792c9eaf4d42c9197536169c7d88d33e0024974dc0795 |
| scripts/firebase-email-verification-gate-exec.js | 22 | 762 | clean | 4cacb88a69c09fce6d27e01da2993015b8c3bf179da3caba5072cd3f4deab11f |
| scripts/firebase-emulators-exec.js | 12 | 366 | clean | a568875e748029ccc52c2ac55391a308c03f78a4e8cddb79423b9b4731996880 |
| scripts/firebase-firestore-emulators-exec.js | 12 | 381 | clean | db66beba7089a02a8ed6dd108a63dbca3d452f981130851f88400f960f35467b |
| scripts/firebase-functions-emulators-exec.js | 24 | 871 | clean | 39d240af2861c813368cede03aec3c697d5f00d5c03b8c489d0c4258e09feb6e |
| scripts/firebase-storage-emulators-exec.js | 12 | 378 | clean | 7c2f5af69e067d1ea091f6b17f926c98317fbb6d221685ec13737bd32619fe77 |
| scripts/firebase-test-runner.cjs | 101 | 3104 | clean | e7fb47edc6b30d4645c3d477bda8d1b543a1d072b43867d23c60780468ec0ddb |
| scripts/functions-deploy-safety.cjs | 167 | 5431 | clean | d74ccd58041421057f49e2f78eb6b7be853988adb9361fbb7508b82baac42388 |
| scripts/functions-predeploy-guard.cjs | 17 | 664 | clean | f66c8d5144338d594cd0a32404c977de93799b52341977c9fcee4c57aa4680b6 |
| scripts/generate-legal-html.mjs | 89 | 3131 | M | 17d14225aab043cd0a0e67e26fe64fc0e54651b3ea5fc2f3e0322441b7cbc8f7 |
| scripts/launch-android-devclient.ps1 | 130 | 6021 | clean | 7b27714391766bee4bb62aea9255e0edc3e1c0f409be3117edfc15a3635e76ae |
| scripts/release-guard.cjs | 53 | 1634 | clean | 3e1e3fafbcbef49b59080d01219f8835c7d4eccc7da7aa2ce6c366777cf1e986 |
| scripts/seed-emulators.mjs | 692 | 22261 | M | 3f287331e6056903a36213f26a87c0fe2dbb5f086b5bf5d800ffcadcea77c312 |
| scripts/seed-heimweg.mjs | 200 | 7971 | clean | 335143f3ca93ab38ed194316cb68691238dd696975ddbed01f9f61fde2cdee9b |
| scripts/start-android-emulator.ps1 | 41 | 1120 | clean | ac029bf2dfdaa7011dd6ac7042bde956b27a1c51c9391b4956a110d6ff2850da |

## CI / release automation

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| .github/workflows/build-production.yml | 70 | 1879 | clean | 509a81f267bb20dbe70f2d0de6291e08236d4bd124fa9703a4b8124f09b688b6 |
| .github/workflows/build-staging.yml | 47 | 1040 | clean | f947d29b36d446053a6dcda26fac76f4b1cf0fd78727b93979414889f35f3885 |
| .github/workflows/deploy-production.yml | 75 | 2133 | clean | 4e268159ee79bfea0aeb640c8b84289644b18af0fd3789b8b3a61b3209c6736a |
| .github/workflows/verify.yml | 50 | 1219 | clean | c979a24e53d5ec7ead895128b236e5511acc1b122d6205ccd5f8cf37578aa47d |

## Client module

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| src/features/activities/data/activityCategoryKnowledge.json | 1402 | 38171 | clean | 626d7364c42c22b607e1a6a2b0e041c3e75e15e1272d3a785daf62c1ab2ea1d3 |
| src/features/activities/index.ts | 21 | 1033 | M | 0f3768df749b26a6696470b7e15701ee8a4246e7c7dd0d281c1c06825c49a65c |
| src/features/activities/inviteHistory.ts | 112 | 3687 | clean | e545085307728e321627787aee90651acbfe748b23317ed932569474e7b996e6 |
| src/features/auth/EmailVerificationGate.tsx | 196 | 7075 | M | 0039e049816763b83affe52ce5345eeb7412df00b6da460b97732e356d1abd6d |
| src/features/auth/index.ts | 18 | 504 | clean | da9395894e16e72883fb3dcf2601fe000052c9673274260f9f788ebfff6b13a8 |
| src/features/calendar/index.ts | 3 | 150 | clean | 00604b802dbf1530afbb91faaea3b5707ae923d45a7cc22dbe149e7374f0f272 |
| src/features/chat/chatAccent.ts | 32 | 1147 | M | 51973f10d4c2755feaaf8d960cbc5d4f9fd8d03a2ce160b3c933b387e2cbab88 |
| src/features/chat/index.ts | 22 | 942 | clean | b0193ec03c086eff174cda581ecbfd1000df41b99c322fac3b27f7d0d904348d |
| src/features/circles/index.ts | 4 | 192 | clean | a897e3679bf2974c44025b2959be93d833b6946603fda43fee6ce7ea7e1504c1 |
| src/features/friends/index.ts | 12 | 365 | M | 0b7a7bb80b6c95688c5d52dda5bf90fba6180e99a48338913c6c7362944dff84 |
| src/features/journey/index.ts | 11 | 362 | clean | dbe0854448ce89e998113b5a099007225d7fa0176e9732954e873fcfb67141c4 |
| src/features/journey/journeyBackground.ts | 726 | 26835 | M | 26b260d324c24f7e3ad97bab5cacd954dae054803871e3d4481d288cd19a91b6 |
| src/features/mailbox/index.ts | 10 | 388 | clean | e3c6c41b7045a8aac62e64a76cd72913104dc4f27c47b08bbf3e1ab40e72e295 |
| src/features/mailbox/mailboxModel.ts | 130 | 4709 | clean | 84042879d33167e9b8a0ccd6ce19de76a85c74488779d078b158d70cb62ffc6e |
| src/features/main/index.ts | 5 | 229 | clean | 5048834d5735091c6c36762fee971fe050c0827190b2812d82c7e7c87b42922c |
| src/features/map/index.ts | 13 | 446 | clean | a858c5cd61c010a23e6aa9b5e3c82ff8a90de8444e828944c4766eb83692a563 |
| src/features/moderation/index.ts | 5 | 300 | clean | 80d348f88c67391e00a3bb180bfe72bd7431e561f6e6e4e0ad37adac0ba8e087 |
| src/features/notifications/index.ts | 4 | 225 | clean | 50490c92c5ded11578e5a1c5a86c4f28bfb8863eb7b425196b331f3f0df04c68 |
| src/features/notifications/notificationResponse.ts | 20 | 687 | clean | 90044fd2cbd984cac09857a41ee051c446c342d247a89cb526fedb17efada951 |
| src/features/overlay/core/coreSelection.ts | 373 | 14620 | ?? | 11b6d56b9a11cf5238540eaa1ebb3b02f64c6d5c0541766e903c7526dddc2834 |
| src/features/overlay/core/coreTargets.ts | 178 | 6310 | ?? | 3b10be01994f2c960755f3d2e3b43c19eace52b83b7b2d657b4fa126e56d08f3 |
| src/features/overlay/index.ts | 16 | 731 | M | 5e76b42f9638b74c57493e0c6f5b7f691e613db1b5e75da50c3904e9ea42f55c |
| src/features/places/index.ts | 10 | 331 | M | c1727b12ec36edf56801d1133132f1ce8cc96171a4dac901825ae4c76723f24e |
| src/features/presence/index.ts | 14 | 388 | clean | 529d704e9c29415a684809f4a60b334dcc9363f5bfd771808ecb5da980f24977 |
| src/features/presence/presenceSelectors.ts | 110 | 3773 | clean | c15a801dc553adb3a24cee47b2268dcec52edc9bf438816c46482c0cbc757196 |
| src/features/profile/index.ts | 2 | 57 | clean | dc0c5857b286720b5e8af749a870a9ebb2aa751ebed23effb3bf2b4f7f06cfa3 |
| src/features/safety/index.ts | 22 | 873 | clean | d853c1c02641712517f8c66fff8bb6640b282c68908d9c4f24df128730ffceb7 |
| src/features/safety/safetyBackground.ts | 403 | 14608 | M | bfe19b1c28382666d9dae6a319bec17142b3739fa7477703aac1ef84fdca7f13 |
| src/features/safety/safetyLayout.ts | 5 | 217 | clean | 93723ed15c021daf347520bdd4092efcef36f4e9ddab67813a2808bd2685433e |
| src/features/safety/safetyMotion.ts | 115 | 3967 | clean | b4725d41372234594ad59b986df7d237fa921b51e8f554c895a240a89db1e251 |
| src/features/safety/safetyNotifications.ts | 300 | 11591 | clean | e5bb62ad1714136c395d163503382a8f72201bddbbddcc5d764b32302c197dfb |
| src/features/safety/safetyTheme.ts | 59 | 2159 | clean | 5ed960f606203b2ca703c74bc38d7e6d1d264317a45137fea99726a469ab6404 |
| src/features/settings/index.ts | 5 | 240 | clean | a759083e2a2b4e551c78af1fc149679b6548b916daa3584e7c7553ab9d343dad |
| src/features/socialize/index.ts | 16 | 319 | clean | 93336f8e1ca67fbd92867a73de601f442fd8f66847ef21fbc62784641bd30021 |
| src/features/sync/index.ts | 20 | 486 | M | cb4d017780b839e770f10dd2f67f5dd10edb3e63ea49695ea2ccfdace1c45407 |
| src/features/sync/syncOutbox.ts | 217 | 7379 | M | 881efc0d797b4bdb292ebab248d4fc37f99984a0f09c90923ac7ed62cf09ae48 |
| src/features/sync/syncOutbox.types.ts | 64 | 1919 | M | bf4171438868572ed1e6cdbe5b3cf556fe24e93d2f870bf8e5b0866371953118 |
| src/features/theme/index.ts | 5 | 294 | clean | 11fd2b06d52828cbc9cb6d315879731ede2dc562df6a6ff1a9a52b7dc6cc2819 |
| src/features/time-planning/index.ts | 15 | 595 | ?? | 3e5a0cb75b633f1b66fd062412f5c467bd28d8ad79e6837601d7b2bf0231c268 |
| src/global.css | 147 | 4378 | M | 74895f6869a5cccdca46c01df5cc517e4da524cecee3bea9cd30af7e7c67ee3e |
| src/shared/theme/index.ts | 4 | 184 | M | ec8daab0b0dab3a8f7fcc784227945599a3a4589a4f6b036903d44b7ccd41b3c |
| src/shared/theme/motion.ts | 95 | 4388 | ?? | 417f578fe4745f60416f5f8e69fa58fe5bbed91e77acf30de07a2fed466c2a30 |
| src/shared/theme/textScaling.ts | 51 | 1952 | clean | ce36f7bfa0f90ce0039b9e6faf8ba71d21d0ebe45305dfa77b77b7e1fb3aa706 |
| src/shared/theme/typography.ts | 40 | 1810 | clean | a271ee9e0384f82856b9be270df10142eaf16c93f8718711f904e451a987e790 |

## Cloud Functions

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| functions/cleanup-expired-surfaces.js | 52 | 1714 | clean | 515fc166a43cfb5f72f9a3a6d56557334055215b122e99fac34e28bc20eab347 |
| functions/friend-search.js | 100 | 3548 | ?? | a18728590f43a75376bc24833410e92c16eda12d992f033d45aea2e504bad571 |
| functions/index.js | 7539 | 289689 | M | 7ddfaa00f3cf0d233499aaa8e2bcd98194b0d9603d269c949b74726b93a054b3 |
| functions/package-lock.json | 3176 | 90458 | clean | e3d59201983f05a6437ce1e3bebed66b4f3a602382a668aeca9a962dfd9e6996 |
| functions/package.json | 17 | 280 | clean | 4908ef381379855464327defdd50d0de0da0e2f3b3f5787b84aaf4cff4b2c267 |

## Components / UI

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| src/features/activities/components/ActivityModeSwitch.tsx | 114 | 3939 | clean | e356d8aef7d121e6c33a7f854bc640eb9e29552f8f254dbeabc05539ffa3aace |
| src/features/activities/components/benches/AudienceBench.tsx | 587 | 20325 | ?? | a2f0aa5e750ad19896f45f375e1decaeb77bf2f8709d6e69d5f99c3e1da690b6 |
| src/features/activities/components/benches/CapacityBench.tsx | 202 | 6941 | ?? | e456aa9b1b5d3e88340b848f708da730c125a3293a8d9fddc81af3ee9a251a86 |
| src/features/activities/components/benches/LocationBench.tsx | 364 | 13181 | ?? | 223a4253d32c30535bcf1cf07e8d22c8ac8779757617f8b367df779770dce06c |
| src/features/activities/components/benches/ScheduleBench.tsx | 468 | 17963 | ?? | d8e715bc33981c04f431c7b1b6e457006a3cfc4b0753385fa35e6ccaeeb80f9b |
| src/features/activities/components/CategoryIconSlot.tsx | 164 | 6238 | M | 761fd37558221b800294fdfa55ae8fe3a3ee896707e97f28778afaaab4eb5729 |
| src/features/activities/components/ComposerTabs.tsx | 397 | 16102 | ?? | 4c16081768c43c5369239c580dd59789b90237a78cfcb7494173dbb2f51a542c |
| src/features/activities/components/DayStrip.tsx | 160 | 5710 | M | e6b02673090b3ef335bf21246274e42dc613ce3f222d463bb9061f3bff0db85d |
| src/features/activities/components/DurationPicker.tsx | 234 | 8107 | clean | fb379ab1588d8c2ffb5941f44296d7b9c454d83e1d9c9936994b322bbe88b5a1 |
| src/features/activities/components/PlacePreviewMap.tsx | 218 | 8096 | ?? | 63e01814fcd362933dd380611dfc7d5b01869e3ea3297c75021cdb8003ccaf68 |
| src/features/activities/components/PlanningTimeBand.tsx | 941 | 32879 | ?? | 97575290389121a3748a6bc593c828978ab78602d8dab4e2dd1d82a7408ab618 |
| src/features/activities/components/TimeBand.tsx | 816 | 29420 | M | 73ae199028e373ff619ff54fe382ed6b4394caa413ed415974fd2ad52d3ffe7b |
| src/features/activities/components/TriCheckbox.tsx | 135 | 4508 | ?? | 92327844c13f78639898d596760297819a95d8f675fb3e1b9c7d761217171162 |
| src/features/auth/components/AppleSignInButton.android.tsx | 9 | 166 | clean | 7352fb87511074215b703375f78d7c235aaee72b9d59322ccd3818bbcee31809 |
| src/features/auth/components/AppleSignInButton.ios.tsx | 33 | 900 | clean | 3e7842522c76a24d46229c4fa80d2057cd98333ac0cc208cb88c828e299dffe8 |
| src/features/auth/components/AppleSignInButton.tsx | 2 | 61 | clean | 0d70b091b8a345e6bdb8d3331a45521927246aecfc9ca248c78ab940b96fed7a |
| src/features/auth/components/authInteractionStyles.ts | 13 | 299 | clean | 5aebe777727c3511753c4d8b21f608457869b1e28fbe928c0260f8fb120f7b80 |
| src/features/auth/components/AuthModeSwitch.tsx | 158 | 4895 | clean | 5c69fc00176eef37a13c0e7e43b0bc3e64d8110f84502f6e551794ca48fc223d |
| src/features/auth/components/EmailAuthForm.tsx | 637 | 20239 | clean | 83c84ae31fcc469ef6e3f349081f51ef9e21441edc672a651e2783d1e0f243e3 |
| src/features/auth/components/FloatingLabelField.tsx | 220 | 6382 | clean | 25132e4ae28275edb14faa85f4a7724e0466d0afd8a29faea0659c090e6b5fcd |
| src/features/auth/components/PasswordStrengthMeter.tsx | 85 | 2466 | clean | 83df272ddd2816fc26e4ebada6d242887d3100fc165f974d263ebb4cdc963a31 |
| src/features/calendar/components/AgendaList.tsx | 49 | 1538 | clean | 560d82e3c3bd972c18d0e28473a1dba9364bd19932eda0531e2beeea747fa1a0 |
| src/features/calendar/components/AgendaSection.tsx | 59 | 1779 | clean | d239db940b08d8762bdc73fdee44c74bb91be32234ac7b8361e71c6c8127c2d4 |
| src/features/calendar/components/CalendarHeader.tsx | 53 | 1754 | M | 38b4554132b403dd1b019e5da0db0c2c6fd0576e8f5c0f0440d7ad1edc17ff64 |
| src/features/calendar/components/EmptyCalendarState.tsx | 23 | 651 | clean | b7a657008669307b41082ae99def3478b64e6283ae5c37c4d5b7f519dc39dea6 |
| src/features/calendar/components/MonthGrid.tsx | 135 | 4639 | M | d48f3d632bed041c4c5ea23569322f05a02d8c2108a1795b30379a502f79b788 |
| src/features/calendar/components/PlanCard.tsx | 246 | 9925 | clean | df3c0c810d12c33e05df65fd141ba1d222602f8e30344ac3b704a5183b5e12cc |
| src/features/calendar/components/PlanPeopleAvatars.tsx | 54 | 1561 | clean | e7a676e682ead1993a97a9c91116bf8c60bd84ad3f4c3d61193b79dbb8b4354e |
| src/features/calendar/components/WeekStrip.tsx | 146 | 5057 | clean | 7269b1a797e85776387c3f8606ce4102bfde15d0ed329ea577c2fcecf3655086 |
| src/features/chat/components/ActivityChatView.tsx | 206 | 7458 | clean | 86e695571dd531e0c08f247afa0c7f7d5dabc5e3582b9ae79f081993fc193c78 |
| src/features/chat/components/ChatInputBar.tsx | 115 | 4174 | clean | 4c899c789903c0c335597ab40d23d60510a787a659037f68736baa841d501a0f |
| src/features/chat/components/ChatThread.tsx | 301 | 11316 | clean | fd8066f2af639e8763a55f2edb961df4fcc93bfbc70ed087712ad27eb1e3b0a4 |
| src/features/chat/components/InlineActivityChat.tsx | 57 | 1907 | clean | 897a1a1d5d6524d25c0c2dd515211330e2d6c7294316b8512849eb5513cedd00 |
| src/features/chat/components/InlineChatPreview.tsx | 99 | 3323 | clean | ec85826a0d765dec656df9d516d72eaa5afec4b5ef10500f63fd368fe1166ac9 |
| src/features/chat/components/MessageBubble.tsx | 136 | 5004 | clean | cd4e5a8ca006ff71826317ca6789e7300c247a9b77b1ffc1e56f882caf280277 |
| src/features/chat/components/ProposalCard.tsx | 232 | 8271 | clean | 7beda38e5eda3d2b5d46fbd9e29b5a4efea1fa73f020746ed2dbdfdd553d1e6c |
| src/features/chat/components/ProposalComposer.tsx | 165 | 5099 | clean | 57c93f304ba11203be540e1fbe406b0faf44be03d01a4b4a80846a8ae41a6413 |
| src/features/circles/components/CirclesSection.tsx | 366 | 13382 | M | 27ec4353608e751bd6737933051a69c3d8cd28fbeefc2c6ef26171b3de1b74da |
| src/features/journey/components/JourneyShareRow.tsx | 295 | 10989 | clean | 1cf0b1d9787e69a1a819cd641ebed7387fa298902cc16cce424d0d18912c73ee |
| src/features/main/components/FloatingModeSwitch.tsx | 148 | 5108 | clean | 77e133fec5c1e2ea88cf8c61610d9bda91fbb5e69e4775fdef0106931efac91a |
| src/features/main/components/MainSurface.tsx | 126 | 4599 | clean | 9a688bbac14064a27cc851c23bf75385c2eab51fd000a37aef64765ca96fc854 |
| src/features/main/components/WelcomeIntro.tsx | 180 | 5560 | M | cfdb5baf5ac758f65afe4ef3941d371ed8cd3f819470a4dfecbf22dcfc0999e9 |
| src/features/map/components/ActivityMarkerChrome.tsx | 505 | 14726 | clean | 62fdf7b32cab7b697c36d7c987c65b14288f42aa475e1a53f581ca067fa7deaf |
| src/features/map/components/activityMarkerLayout.ts | 69 | 2920 | clean | 6d750532ae163ac8c7ca2a3a06da8740423b8d8d1ff885e564ac7c6e41f3cc0e |
| src/features/map/components/AvatarMarker.tsx | 108 | 2919 | clean | 1fa75a506fd8bdc7c7c874aef28bad6627fc941277cdd2cd7d253f9537937e1c |
| src/features/map/components/ClusterMarker.tsx | 85 | 2108 | clean | 0d2ff6384040630b7db79137449e5f001db1ddf768bf5ba4fcbe562d7d0ec8f0 |
| src/features/map/components/JourneyAvatarMarker.tsx | 162 | 4394 | M | e6a261a53dadfb17d4fe34b9f0702eea3c9010d6ab7e8e87130fa60e1bdca3c3 |
| src/features/map/components/MapCanvas.tsx | 1265 | 54652 | M | 2396ae937b1077e3293f9ba397f1598fb2358f13200b5a14362d06fb28d0dbec |
| src/features/map/components/MapLiveAuraOverlay.tsx | 238 | 7966 | clean | 7e8cdf1ddad5cec20ac4bc17d92b44168014bb02ffa6663807a1d56847799cbf |
| src/features/map/components/MapLocationPickerOverlay.tsx | 273 | 10135 | M | c88c8ee1d65ab249d1e90f2ddf7d8be9f5a0f71ea67df36e0e792ce116cf02e7 |
| src/features/map/components/MapMarkerMorphOverlay.tsx | 137 | 3553 | clean | 5b306a0a4a400314b4fe9b8bd9aa9607270f83640c7fcca454e4977e0e187a19 |
| src/features/map/components/markerCapture.tsx | 280 | 9327 | clean | be50e7e5b7e70734f8d026a1ff8ae1a6fe17504a280c092662b993e0baf8eaf3 |
| src/features/map/components/MarkerDismissOverlay.tsx | 157 | 4256 | clean | 38564f469edc7979c4077080666a5bf958ab0f35b26e0644e402a27cf106949f |
| src/features/map/components/MarkerGroundShadow.tsx | 52 | 1937 | clean | d87f65ddffce0f5539df16dd7f6df689f87f3f380cb404cf6eccbf16a9dc0eb5 |
| src/features/map/components/MarkerLaunchOverlay.tsx | 250 | 7291 | clean | 95e524b5d06006c053b758e27ad361eb8caa6d33fee515cc1e2d6388c44f5a09 |
| src/features/map/components/OpenPresenceMarker.tsx | 96 | 2902 | M | 96e607ee91dd432058288e183ef2f0ce9d8da672d59934f44169f8f74186281c |
| src/features/map/components/PreviewMapCanvas.tsx | 570 | 21174 | clean | aaa36661472e73b120b199347cf2502245a21f48f52251153b10d2cf50c2400e |
| src/features/overlay/components/ActionFab.tsx | 64 | 2008 | clean | b3fb801ea49611d0d24b429404b23015890823c50446bb4a4593be1160baf52a |
| src/features/overlay/components/FloatingSurface.tsx | 83 | 2971 | clean | fd4874e606118ed635b83582799e33ad9b3b426c238efc93ec603a27836b9f96 |
| src/features/overlay/components/MapOverlay.tsx | 835 | 33515 | M | bbae8891435df4b52d4b75afd9a09d88320fb5c5ad244399b481c1c334918dd2 |
| src/features/overlay/components/MapStyleMenu.tsx | 74 | 2689 | clean | 942e1b17a6a007d52ea6779f8c5c31c4205d137db6cb858e3d9552ed8ea07679 |
| src/features/overlay/components/markerDetail/ActivityContent.tsx | 466 | 17155 | clean | 5ff80a506c63201da77f3d70efdf803301f66efea3a559c81722ce56c7e97aee |
| src/features/overlay/components/markerDetail/ActivityHeader.tsx | 98 | 3696 | clean | f7f6daa020ad99c6c0939238a477b8eac5623c3b60f289e5b51bc7c26e42722d |
| src/features/overlay/components/markerDetail/ActivityParticipantsContent.tsx | 153 | 6237 | M | e8a20cb811d8aa3a88ce925e64414fc6a0490033c26b6cb4c4cfe66e66c12854 |
| src/features/overlay/components/markerDetail/constants.ts | 8 | 229 | clean | 76f89f23fad482eb8c66b53078856ece8dedf9a60a9ea83e19927feebdcdd89b |
| src/features/overlay/components/markerDetail/InfoRow.tsx | 20 | 428 | clean | aae105a93279c8d17a44065ef4bb011f5546d85bdc05239dff13d98c27f7efc7 |
| src/features/overlay/components/markerDetail/ParticipantListRow.tsx | 49 | 1608 | clean | bd4d644ebbedd8377663b353ea0f180cf2c031f8d3355f2dae97c395e0a87132 |
| src/features/overlay/components/markerDetail/PlaceContent.tsx | 90 | 2825 | clean | e2d64cf6d55c6cea920f41a16631de3e80c5812e8206bfa1dc4b296a5abf5e4c |
| src/features/overlay/components/markerDetail/PrimaryButton.tsx | 35 | 841 | clean | fe5a0cfb5a58b5625a007458afec585b52ccbfd793da7eff1ffeb14c72f12028 |
| src/features/overlay/components/markerDetail/types.ts | 12 | 429 | clean | b5a4bb54576a75d83a08c45ce9758454f0d02f44325f54093101abecdea2f5a7 |
| src/features/overlay/components/OpenPresencePill.tsx | 218 | 6713 | ?? | 6714cb8623d60d4df286e68633438ffc3ade606492417d0e007e845483bc123a |
| src/features/overlay/components/OpenStatusCard.tsx | 415 | 16032 | M | 3616f6f565c2558b2ae2288ac3e18aec1705a4f1a777ae627e9f10ddbe0509c8 |
| src/features/overlay/components/overlayTheme.ts | 26 | 1391 | clean | 949255d04be277e790db018805aa2a4c5109c64a119b128b23329bded9570630 |
| src/features/overlay/components/RoundControl.tsx | 77 | 2521 | clean | 87ceafd5d98d15650778770de767ca1a74408d29a2fb607b38c856dc76d68fc4 |
| src/features/overlay/components/SpontaneousRoundControl.tsx | 123 | 4171 | M | 95c0793fec219d1be9dcfef4dee89193a1d3081fe8c6ccbf3788ad1e7f7341bc |
| src/features/overlay/components/TogetherCore.tsx | 3091 | 115517 | ?? | 50ccb32a537f3fcbf428af7cb34f8c93a228cf3efcd8ff2b85a91a9ee404c79c |
| src/features/safety/components/HoldButton.tsx | 88 | 2574 | clean | d9a2a22cf99e59bd18f22b1d8c7f6bfd0c796c3db5951a08ceeb2602f7c1d1b8 |
| src/features/safety/components/SafetyConsole.tsx | 422 | 14586 | clean | 89df8108388b40ac1d11d607561c51f0cfe8a4b054ce579231fecf6c428e198d |
| src/features/safety/components/SafetyConsolePanel.tsx | 385 | 14742 | clean | cb4407f2640bb7ef9050eaada13acf5a712d6336b0aa956226b5229a34ab8139 |
| src/features/safety/components/SafetyOperationState.tsx | 132 | 4130 | clean | 4a29407f98957840f2977956eb69aaeaca17c3b7b2b0e226de7875ab354ed9c1 |
| src/features/safety/components/SafetyStatusPill.tsx | 189 | 6735 | clean | b38ac89bf9bed78b256ca65a6ffd4cfbd51554974800d59c456fbcc54dadb83e |
| src/features/settings/components/RadiusSlider.tsx | 178 | 5565 | M | 23385e0d08d6f71b25b05d1b5268b7a472a7878ea28ed0c8c799f70a6bf2b417 |
| src/features/socialize/components/DiscoverCardView.tsx | 148 | 5639 | clean | dc4cdaba353a207d97aaad10419a46e412c5dd84e11799d6c4b72c71b6806ea5 |
| src/features/socialize/components/SocializeSetupCard.tsx | 299 | 10705 | clean | c5f7130be3ace78468f100bbaa7771416a51ac4195dab71c9dd52e436931d628 |
| src/features/time-planning/components/AvailabilityBand.tsx | 200 | 6888 | ?? | 6623865398986657b4a7a571c47d724f860f1c47948d77845a3ca0f6d9860505 |
| src/features/time-planning/components/AvailabilityMatrix.tsx | 142 | 7049 | ?? | 72a8301aa0269a0fa9804fc4231e4302b36975176eeaf77e62d3d86c7b46936c |
| src/features/time-planning/components/PlanningOfferFields.tsx | 606 | 21673 | ?? | 08b2973679aa65dad5959911adb35f961997398105b7bb348947fa7242a385d0 |
| src/shared/components/AnimatedToggleIcon.tsx | 90 | 2886 | clean | 15a6e94ef99321ec902426a4f0e082cdd9ab92e4b8b243bc169b2a947e3f82e5 |
| src/shared/components/app-button.tsx | 82 | 2454 | clean | 29f7bb180f44447de5e7aaada6a27f165eef3b0430fe645a379c3e56fb9153ca |
| src/shared/components/app-screen.tsx | 52 | 1575 | clean | 61a80c073d46d0d57e38b28aa7964a8d507abbf2d317b4951e924173223164b0 |
| src/shared/components/app-state-view.tsx | 59 | 1696 | clean | bfa421e203650cebffa3617d196f4f04d099b7b1daaf5affb46b2f981c35944d |
| src/shared/components/app-text.tsx | 25 | 1032 | clean | 76c5cdef667f028b069e7fc3870a43b1a5eeacab777abe6fb315d56427a35a7d |
| src/shared/components/brand/BrandBackdrop.tsx | 206 | 6861 | M | 6c4431f875fbf9f328efb6cb8da4869cfac7f58b24e968178922e95d0064d360 |
| src/shared/components/brand/brandTokens.ts | 18 | 456 | clean | 4601fcbad9dde8e14cbb6c75c7953591bc0c75af35e897b5483a2da13df0e1d1 |
| src/shared/components/brand/micaLogo.tsx | 139 | 7446 | ?? | 0d4a66233d8cbb67c2ef68ee6e53d65d3dc9c0b3b82a72184ad3af20c7501dcb |
| src/shared/components/brand/TogetherFinalWordmark.tsx | 18 | 529 | M | 1483b6261428454b4f9718518a2ac5e7410b6c5b0b8f14428bb6f00c97d0d30d |
| src/shared/components/brand/TogetherLoader.tsx | 142 | 3778 | M | 5a31137a949c4680f766b28996c3948bb0a875defc2491b02298d6393d5ca5f8 |
| src/shared/components/brand/TogetherMark.tsx | 145 | 3599 | M | 1d1737d60cfc18eb2cb08f0cdd8218c7dc6eb5e47df0c5e4bb394758b0eb39ed |
| src/shared/components/ColorSchemeRoot.tsx | 35 | 1267 | clean | bab5cefbd757e0f5ab5ae610f40a11a0aa84768554f2e7809050592fe42793fd |
| src/shared/components/index.ts | 34 | 1762 | M | 718202b8bbb2fec5972383c433c8f8593392c2d3f5bded986c09304dd5d5f0e4 |
| src/shared/components/PersonAvatar.tsx | 99 | 2517 | ?? | 2b09788a08d36ae2e9664b14f9d454ab82d2b14c0d7b400f2b72b18cc8375917 |
| src/shared/components/PressableScale.tsx | 73 | 1974 | clean | cc0d1433dc9eb0aaf21aae8a3ee2d090a8b86423986c09ebfa7926b881033135 |
| src/shared/components/screen-header.tsx | 40 | 1319 | clean | 71c6072a2528dd3521b7d033fe94b799e2feaf027f71b2602a661e00a59ce639 |
| src/shared/components/SearchField.tsx | 101 | 2764 | ?? | 85b166046986f7db9fe2723b39d271bad7eacf7333717816a7d5223d490a04ae |
| src/shared/components/SelectablePersonRow.tsx | 101 | 3056 | ?? | 4096744dc4f327f6fa909b9d7d06f085dd215298d8369d03227c1b24398bf3b6 |
| src/shared/components/SquircleButton.tsx | 185 | 5596 | clean | f860272b0eef957eac6d524a4f47e8ec2f3f76f45000b81d1f188003d0fa2060 |

## Configuration / dependencies

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| .firebaserc | binary | 123 | clean | 1ffc007864bcc1c4fea58d20e2bb563f398813fd6cf3bd03b544500b6f1b1ef7 |
| .node-version | binary | 3 | clean | 5378796307535df3ec8d8b15a2e2dc5641419c3d3060cfe32238c0fa973f7aa3 |
| .npmrc | binary | 22 | clean | a093bb2fed59d699b7f9a62a5203cc196054c624e9c39c6d908c9e7db5dd2464 |
| .nvmrc | binary | 8 | clean | 9e4a98495fccf30bb42ef14acad25fde8d2d550d87c66120ae0478a5cfe2cce1 |
| app.config.js | 136 | 5762 | clean | 57a478650794f07f676d3a3e5f5b1f25933c8a04c27e4a7b0854f8dd06efecd1 |
| app.json | 103 | 3272 | M | 8051903f19ec2294c32065e234f415561cf51cb17091a805a6743c06471420c7 |
| babel.config.js | 12 | 411 | clean | 1adf86e1454a9050f1d4cec4cfc8a65488b5de76f6ea4ac0d3a6f19ff83767c7 |
| eas.json | 48 | 1257 | clean | aebfdc4650caa92a1099102cc0d9bb9f722d7f092fdf3dd2dd7592a2a0e06885 |
| eslint.config.js | 13 | 376 | clean | 7cf64c2779b7e2ddbb831504304fbd70cf2ee743a9698399e54f91c4800fbdaf |
| expo-env.d.ts | 3 | 110 | clean | 6fc02634da46d3edc5a88eec9173ba6bf709726be3cba83c73ebd8e859d5c147 |
| firebase.json | 26 | 693 | clean | fdef59349f8c3b65bc4013478810fe04fde4dafc5f9cf965a9d8767c7eaa16fb |
| global.d.ts | 5 | 211 | clean | 0b2f8f0052c69a91d0f2e1a1cfb7579e1ed99ad040c7b5aad45756023fdb2193 |
| metro.config.js | 12 | 514 | clean | d977af7ed17dfb22e38d9ea60b6f1ff6166941901a78de252b8d21cd17ed3783 |
| nativewind-env.d.ts | 2 | 43 | clean | ba93dc3eac6e58df36919fd4905c4cf02cae566cbb7849c3e3de3451f8ac28ff |
| package-lock.json | 25701 | 945696 | clean | 0ad7bfb4b05cfb64f95f05b70166d0095ec56b432b0adc13971f5cb8ce754b4c |
| package.json | 187 | 9702 | M | 52c0c54735dc94665b5b1478bde3e53b8d3a9b2a31aadf8637f636f7f95a088f |
| postcss.config.mjs | 6 | 70 | clean | 4cae941be9bc3bee9a6905e47ea7a51aee216d587d34a8cc4ae48f78fd6d8159 |
| react-native-css-env.d.ts | 4 | 174 | clean | 42188d3d084d3c9b19f742b6b017038b5754685662a66c1f8ba1e1e21566511c |
| tsconfig.json | 13 | 307 | clean | bd8c38f75e1119b0be6e9bf264c233dfa22c4a3b5abb0299ae8a9abd72248ef0 |

## Domain / data models

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| src/domain/activity.ts | 21 | 486 | clean | 952c433f1628fda5dd84d8576b15ff3f463c114bfaab712540c3fe2e206e1b7a |
| src/domain/geo.ts | 6 | 128 | clean | 4dc768520f65e4902a6347df8091f7244cca7b64df60489d2611f8d258fd6dda |
| src/domain/person.ts | 11 | 276 | clean | 20c12d60158aecea560c66499366ef1f1944c544f14028a80072e0c705e039d3 |
| src/features/activities/types.ts | 54 | 1948 | M | 17b9caa44147d479ce137847d7f562af5ea8d48ff498ac68f6b9f65a46b0af0a |
| src/features/auth/types.ts | 93 | 3214 | clean | 5bef8123f9ae85dc0562489d9cc73440610c3671aad190871955c8bd0cf1394a |
| src/features/calendar/types/calendar.types.ts | 37 | 930 | clean | 78bb0257a35d74d1a2dcf631e7f2ae86ceec6a25d21707c204045b23ca969732 |
| src/features/chat/types.ts | 158 | 5578 | clean | dc481a9d61c58941a76ac885a7a55b4084df2663687efcf9d30db11614b7f026 |
| src/features/journey/types.ts | 56 | 1655 | clean | 2e10663e4dc37212cacc69d3fe55da4aae80d45881e4da51cf11a86e8d7ca928 |
| src/features/main/types/main.types.ts | 2 | 43 | clean | 8ac63b7a26339fdf5b62b314081a19407b73ae252cc858c7d2c3a4dc94285e06 |
| src/features/map/mapStyle/types.ts | 29 | 1125 | clean | 30f9efb61cef4fe1a3bf5216cbb18c3443c89280ec62da0089d3c16663523d5e |
| src/features/map/types/map.types.ts | 160 | 5723 | M | c490a639771e6df7963b4b9da678524210f05bc25c9067c721cb1d2cdf072052 |
| src/features/safety/types.ts | 167 | 6096 | clean | 18138e5ce85ad505399650ab5799f1562ebb133b2153d699444825264abb345b |
| src/features/socialize/types/socialize.types.ts | 44 | 1241 | clean | cce16a387950b0da85e4e630e00570c9c36686a1ec8c90905a4ede6643a91a0e |
| src/features/theme/types.ts | 13 | 491 | clean | 17741d296a1fe99abff0cdf06974dabadf9251572e7ae677656f7529e05efc8c |
| src/features/time-planning/types.ts | 73 | 1885 | ?? | bf02749fa90ab4e213a468e379ae9c5f8d8171beb522d57175774d81f0f0c27f |
| src/types/assets.d.ts | 5 | 112 | clean | e2a157df3529729834f464a5c95805f373dea6927e39475470914cb6dae99210 |

## Firestore indexes

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| firestore.indexes.json | 524 | 12671 | M | c7083175eb87fe8ea9c1e8fe730ef6da629009393f9437f20f66c0bfd9d9b4d7 |

## Firestore Rules

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| firestore.rules | 550 | 27574 | M | 353302b98e2e347aeec82a294ccc4ed4be09b716e92bff6f287eae7355a92771 |

## Hooks

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| src/features/activities/utils/useCoordinateAddress.ts | 70 | 2615 | ?? | 8b5aaa5894fca1a47c9ac961724102db4bd2006b5f961f9380d3a663c34962ce |
| src/features/auth/hooks/useAuth.ts | 16 | 432 | clean | 16dcce49cde410e8c4b7c7f4f0ccd702fbd2d77932ee868f2e3f555cf7659f06 |
| src/features/chat/useActivityChat.ts | 10 | 256 | clean | 0ba270497e719b549a57c7e0663c6a69d04796471a187f7ad31f36410e7ba6b7 |
| src/features/chat/useActivityChatActivity.ts | 11 | 367 | clean | 80b222ea80cb0ab54957c0e262f28b8cd66ec65f539f794994a6df9d6805f25c |
| src/features/chat/utils/useKeyboardHeight.ts | 39 | 1603 | clean | b7f721ef7c1363f40728c3870a6d70b4e712ecbe3d009370c85ba926002a72df |
| src/features/mailbox/useMailboxNow.ts | 15 | 354 | clean | a9211eb249b1e894ebedefe493dd77b050a518dd73bec1c0be5e5d919fd85556 |
| src/features/mailbox/usePostfachBadgeCount.ts | 99 | 3448 | clean | b2eacb9ecf6cfdacc1ee1b880e2b4d493ab07826cd3f24572f6120f70722604e |
| src/features/main/hooks/useMainMode.ts | 14 | 436 | clean | 1301194bf4300997c3aedce07143a43f4d1b1821b3621e052cbf9228d0efeec9 |
| src/features/map/hooks/useMapLocationPicker.ts | 366 | 13362 | M | a40c4697bab4c92c4f86897867d7bf9a4b1e3acdd71b59dc5c5a79d0b849de04 |
| src/features/map/mapStyle/useMapStyle.ts | 13 | 354 | clean | 77a407d3116f8c5d3df85b51bd0ca042636a53614c83d6401e709b098d1be2ce |
| src/features/map/mapStyle/useSunPhase.ts | 94 | 3407 | clean | 9054a665ad4778b881ece7fdd58a0aa909b532fa4e2151ae6746d66603d64a6e |
| src/features/notifications/usePushNudge.ts | 37 | 1203 | clean | de0aec02f369f9898b47900e29e7eaf4d0ad4fd0c3a8ac68dad61487d56b8423 |
| src/features/overlay/core/useCoreHoldHint.ts | 36 | 1069 | ?? | bc96b6fd624ef6edcf1516a393c8437401b3d98ed1d65241f5db77e683e85cbd |
| src/features/places/hooks/usePlaceSearch.ts | 228 | 6915 | ?? | 2e6c0afa3ef7917fc1aa88b383f54b2215ff18e8995a05f1032a753541c5631e |
| src/features/settings/useNearbyRadius.ts | 10 | 288 | clean | fcea24737ae51b9f55fc23a5081f13f73a393258d535328c0a8dcfcc389508bb |
| src/features/theme/useThemeColors.ts | 50 | 1317 | clean | 6a9efae79199aaefcdb6b48d0ed91b8046b3627626bfbbe53bf83258a8edea4d |
| src/features/theme/useThemePreference.ts | 13 | 410 | clean | 26d09162021921e52c1c853cb540d590963dd722a0c4c1842b9a43503c97f5ac |

## Legal content

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| src/features/legal/datenschutz.de.json | 300 | 15685 | M | cb6b81463efe78af8249c418882baa3c4badb8d20310ed38036db36c1e4561eb |
| src/features/legal/impressum.de.json | 48 | 1010 | clean | 9f6985b2981d3f60c8a634ebb96f34739d3ef0a548c5e8748bbc6e9b857d04d9 |
| src/features/legal/index.ts | 4 | 183 | clean | c37c6443d7960d65ac27144b1092388d4e995acc593c88100f256a0571b26fdd |
| src/features/legal/nutzungsbedingungen.de.json | 114 | 5350 | M | d39209fc522e0f7da41447fa65fc69e89c6aea1fd5e8dc93255af32d83ba5384 |

## Local operations tooling

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| admin/desktop/main.cjs | 318 | 9445 | M | e67f23eab462cae3c95db0f25576361067e74ac5a9c7156677157acc8b11830b |
| admin/desktop/README.md | 33 | 1443 | M | 37e96f0cb8778645a2e1cc1afdee39cbb3ae293d7087ef2f328758028bbdfee5 |
| admin/local-dashboard.cjs | 716 | 23729 | M | 925b66e9d6cf34f32e5fefd459d7c11b1a8c129c68025ddd03ca10d47bacb9cb |
| admin/public/app.js | 366 | 12726 | clean | 655860e8b43be64b4dfb4451fc5a1ea6af2f98993b9e767f53a0e2ff6a96ac42 |
| admin/public/index.html | 75 | 2714 | M | 77dabc7b241a0e21688c328e81f513c289c7d68230511a888e53f4530de174f2 |
| admin/public/styles.css | 353 | 6230 | clean | 99bd473061975f76abbe072e96284b74a55bd9423666539649d7dcfe0d20b9e9 |
| admin/README.md | 115 | 4384 | M | 3acf667959c9159d5567f8db0ff1b6b5b6959d55c7b6c6d0354bbdf8b9e65eb4 |

## Native Firebase identities

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| firebase/native/dev/google-services.json | 31 | 790 | clean | 4abc63f5363e79c5831e00a39ac149ed800cb0676515989f5947928f01ba5348 |
| firebase/native/dev/GoogleService-Info.plist | 33 | 1012 | clean | 880162c027576e7fe7e22497b2a175380da1f30ebd2cf470f56eae1f2d9277b6 |
| firebase/native/prod/google-services.json | 31 | 687 | clean | 68658e8c71ab6df418c5a07f91c8b6e6754a391d8cf3d27084cbea9d32b763a4 |
| firebase/native/prod/GoogleService-Info.plist | 32 | 889 | clean | e8c598f3b1e844cf30f6fcc9d8357ce73a8ee7dbe3b25aee9ef051f00803ab8d |
| firebase/native/README.md | 26 | 1178 | clean | 8fce5305c262c03ee6596f616b2694722cad2adce5ee7df90cd830a5ab91a3fa |
| firebase/native/staging/google-services.json | 49 | 1277 | clean | 0470d4442fd541b47f8e1863c1bb7439b45a807f8b915683649d2b1630a1c46f |
| firebase/native/staging/GoogleService-Info.plist | 32 | 1020 | clean | e2361f49761664849aca4c297a0251dead42042c602b4881f7ec5983ced5ba63 |
| firebase/native/staging/README.md | 19 | 597 | clean | 315b39f8f73738a9cdd1be49f2ef447d1f66820721d84410e982cc398d88da8e |

## Providers / context

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| src/features/activities/ActivityEntityProvider.tsx | 939 | 34786 | M | 03e67df4a72f237e5b1785f141971f694c652f40e1283cc80d437cb1e5908dd9 |
| src/features/auth/AuthProvider.tsx | 191 | 5524 | clean | 47bbb22b47d8af0a887dbe38cd3c2f0ac09988a2aa15228ef499cfcc81ceffe2 |
| src/features/chat/ChatProvider.tsx | 1345 | 51991 | clean | 4a3a3f9d0526df408cfaf020191595885ee29112fc086cfac8b2973eba89ae6e |
| src/features/circles/CirclesProvider.tsx | 124 | 4080 | clean | 83d65943a99c4c1291487cbb5eec84b3a4e6a749353db5c578709c0f8a889433 |
| src/features/friends/FriendsProvider.tsx | 364 | 12599 | M | 2fa08dbe7842b744e336ff7c32834617387e39bde66096223991f47bf43f9cc3 |
| src/features/journey/JourneyProvider.tsx | 395 | 13644 | clean | bcbcb84c5de084c1037cc9b5127e89f4d45675f23bbbd6a296e8edf344929deb |
| src/features/map/MapBootProvider.tsx | 99 | 2823 | clean | 6d7b2f916fd8c17325f7c486c954a7d23cc9b879fdef4f014dd1901bcf59c1b9 |
| src/features/map/mapStyle/MapStyleProvider.tsx | 80 | 3581 | clean | 13f9c5184d4afb5e6285bba61e642f5e583e66a7adfafd7d85c892903c38a705 |
| src/features/moderation/ModerationProvider.tsx | 74 | 2615 | clean | 6fcd73d30e7ba81c74e95e58451aa2283e7aa1774979f2efd48d94ee5f15a4d1 |
| src/features/notifications/NotificationsProvider.tsx | 292 | 10698 | M | 31ee3ea30335b02a1d134eeab88f8164e809b4d0d243c79a361f3e0788faa28b |
| src/features/presence/OpenStatusProvider.tsx | 519 | 18927 | M | 08da6da33cea56b06e0b2ed4e0fcc611b23343604a494c37806fdc8e4251d478 |
| src/features/safety/SafetyProvider.tsx | 922 | 35681 | M | 824be1dd3b55fa06ceb37c35ebc76ec6333751ca7edd02487a592ba3a8855028 |
| src/features/settings/NearbyRadiusProvider.tsx | 48 | 1525 | clean | 67baaa2dcfddd21bd572a78f41f3f50d4c7311049c8772c84f6d6dbd80adb209 |
| src/features/socialize/SocializeProvider.tsx | 298 | 8394 | clean | ca6d920bf11d1a548b0be19b0ded792885ce0528ff8d590ba5641334259535f1 |
| src/features/sync/SyncProvider.tsx | 116 | 3407 | clean | a9e7073dd027448adeb9c4d3fbb48254e552ca2afa574c51d6e7787fc7671182 |
| src/features/theme/ThemePreferenceProvider.tsx | 59 | 2024 | clean | 5aeca76969c104abdd19e577b38a74473c8e263e389edeaa7afe096cc5fbd5b1 |
| src/providers/AuthenticatedProviders.tsx | 52 | 1818 | clean | b96d469f6738dec049f37bf1261e4d4a0410bb1c63a9f84e7f0aa9eb7065fe6f |

## Routes / navigation

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| src/app/_layout.tsx | 392 | 15391 | M | 9774faffa5ed0dd1b42e9ddaafb489f53431fee577cead0b2e9e41db732d592c |
| src/app/(app)/_layout.tsx | 12 | 285 | clean | e491c70d29472fcc76cb4c6e089a094519fac13db645e89e8896ce09f2eaa8b9 |
| src/app/(app)/friends.tsx | 6 | 124 | clean | 6c238412a1cda1a0fc1d54b538a982acba50541db73e708ccf9f974d7d8fb1c5 |
| src/app/(app)/index.tsx | 6 | 114 | clean | 7870689d988406cd8700d1588816bb221b77ee574e5ea50b244d27d2fbd47ffb |
| src/app/(app)/profile.tsx | 6 | 124 | clean | a72858137f93acef32274f472c68984feffab72302445fb8907a61c199a04760 |
| src/app/auth.tsx | 6 | 112 | clean | 4c1d196c1afb25cf0ded2f4de1e5a8f829f621f3ad118314c7966c94ba3ccf37 |
| src/app/datenschutz.tsx | 6 | 134 | clean | 1579bb4ff7c8e10046693cee7ca2b27439b71ad44ffda701165f410e82571195 |
| src/app/impressum.tsx | 6 | 128 | clean | 0cfe90e4708c45f8d69ab94875bedb71ae2848ea975289fb720a8d06a62aa29f |
| src/app/nutzungsbedingungen.tsx | 6 | 158 | clean | 8cfaa75874b80099216cc01824780e0de95506792fa1d66874572695377e3b4b |

## RTDB Rules

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| database.rules.json | 93 | 7048 | clean | f50b6431965a3ebfb74b2268fe889657b92f0004160cbe30f25b3de297f7f664 |

## Runtime assets

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| assets/brand/como-wordmark.svg | binary | 2459 | clean | a458bd304219cce5fdf98bf3d1975f1dc750fd12fb829018cf5f3e9b5d799c63 |
| assets/brand/together-mark.svg | binary | 391 | clean | 5b4f9110836ea1cbad08f3291a43625883e7d0c2d64effcd54e619c3403b2728 |
| assets/brand/together-woven-legacy.svg | binary | 747 | clean | da17af8febb28de93cfaf2d3daa4cad7fdcc744dc9e47fd3833b11b695b3ad3f |
| assets/expo.icon/Assets/expo-symbol 2.svg | binary | 608 | clean | ad117d20fd819f4ec71876ce09c0e8b9275b1f20c5ec3c9d7d1914977ceffec6 |
| assets/expo.icon/Assets/grid.png | binary | 53681 | clean | 8247d79a2b31328fe4e330a973e6fae16924ed9aebd72c64d464d6856ab18c72 |
| assets/expo.icon/icon.json | 36 | 706 | clean | 3af0266c3ba528c7b6d7acab596fd9d782e49532803632bc6ebab32043333b9d |
| assets/images/android-icon-background.png | binary | 23063 | M | 150b0beeb905c76cc6db1f0219798ff75c388520d9ce5e34d10ebd7629369d38 |
| assets/images/android-icon-foreground.png | binary | 21035 | M | 629e4957784db160410b8a2531c6c56ad157f56fb15532aa06653cd81862aa6c |
| assets/images/android-icon-monochrome.png | binary | 15077 | M | 3907d66a4ee3afa74ad49d40eff22e2fd971e1ee6b3e41d97ccd1212b0a9ebcf |
| assets/images/favicon.png | binary | 6417 | M | dbaa9d4c419e0066b32bdb83ecc9ac65b266cfbd36b65414e13ad6319d29d19e |
| assets/images/icon-dark.png | binary | 758183 | ?? | 25a3e8b6d281d17722724a159b149c741b7dce99dc68715e6e5686098ba68be0 |
| assets/images/icon-tinted.png | binary | 399032 | ?? | 748828b28687219f2efebb9af9ab6e06d638b56d37e8a033285ec3765c173316 |
| assets/images/icon.png | binary | 727638 | M | f96452549e42c1ab4433b76c224835663280db1fb3fb215df688c77f479c7d33 |
| assets/images/legacy-woven/android-icon-background.png | binary | 16438 | clean | 5bcd05913b4770769d7318d068257b38550998d624009c172238e09a2f1c4c79 |
| assets/images/legacy-woven/android-icon-foreground.png | binary | 13510 | clean | e5b7fb12e7cf8cf00398d8d0cb28f63248daac4bba0f32bdd5e79dc8ef14f683 |
| assets/images/legacy-woven/android-icon-monochrome.png | binary | 5396 | clean | c4fcd650d1699a1f2eff1bedaa43d970c5f38c9d120d80267dec37bf9e18aa90 |
| assets/images/legacy-woven/favicon.png | binary | 2361 | clean | d53aa19dd2c6c6337a303031a5444e9137535a8fec6e516fdced83382740a2ed |
| assets/images/legacy-woven/icon.png | binary | 81431 | clean | e589438782469f9a9327fb1919f6a04dec97589fb98e203c21b89eb05cde2d65 |
| assets/images/legacy/android-icon-background.png | binary | 17549 | clean | fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d |
| assets/images/legacy/android-icon-foreground.png | binary | 78796 | clean | 9e3d0315a33c6799de601dd34cd8bf8cc3a8d16f3bf75592baec2ceb7240b391 |
| assets/images/legacy/android-icon-monochrome.png | binary | 4140 | clean | 6371fc2c12e33ad2215a86c281db3d682a81bebe7c957a842c13b8bf00cceb83 |
| assets/images/legacy/favicon.png | binary | 1129 | clean | a4e030697a7571b3e95d31860e4da55d2f98e5e861e2b55e414f45a8556828ba |
| assets/images/legacy/icon.png | binary | 799005 | clean | 7a667804bb80a6a424a5daf18a2599c4f32237cf06fe78fc0de45dbb09e0eccf |
| assets/images/splash-icon.png | binary | 25958 | M | 83dc3aaf6330b3f7ec50a51ba35ab3f45c16df3529867dcabddfc7a8f90f203d |
| assets/Together - Spontane Freunde-App/design_handoff_together_logo_animation/full-exploration-source.dc.html | 582 | 65230 | clean | cc4f6ceda9a8741a79344e69e195dfdebf698ac334e2ec171b6f397cefb134ad |
| assets/Together - Spontane Freunde-App/design_handoff_together_logo_animation/README.md | 138 | 9583 | clean | 8d7b81832bc5aab147441ba6b4d491302964cf3b39182ea011d697ae90457a68 |
| assets/Together - Spontane Freunde-App/design_handoff_together_logo_animation/reference.html | 89 | 6449 | clean | 011e24f3e602af64d985a25c4a5c73aa66ed764e402a4ea33449e1b14ffcd379 |

## Screens

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| src/features/auth/AuthScreen.tsx | 505 | 17276 | M | 167fddb49cba2eee3173d988cc7489cbfb9829c7034ce65f5dcf5e2924a10178 |
| src/features/calendar/screens/CalendarScreen.tsx | 344 | 12704 | clean | 33f2c43b14c69ab799719d43b1149c614f1e13dc2846716eb10b328cb54a4fd9 |
| src/features/friends/screens/FriendsScreen.tsx | 617 | 23219 | M | 4cfc6aa89fa1e0f46edc275c0b5d856c2c4490128f6af6254d43cf1122c2e88c |
| src/features/legal/DatenschutzScreen.tsx | 7 | 176 | clean | 5c96d45c13b26816fdc2b180ddbd416bf95bcf6056fbf2ec489f18b66025b9ba |
| src/features/legal/ImpressumScreen.tsx | 7 | 172 | clean | c3f1d3b234d5c7f08ec592a74d3f1854ab61a183442c31daec004b154ee73476 |
| src/features/legal/LegalDocScreen.tsx | 63 | 2025 | clean | 66a354de7015bfcc2d042ea50e81be4c07bd0f0dbf9a8d9b61b614f7d53a5afe |
| src/features/legal/NutzungsbedingungenScreen.tsx | 7 | 192 | clean | 6cc06a0631c4dbe2693f3e58e8eb574013e81f75fd1a1ac734283a947e1e96d3 |
| src/features/map/screens/MapScreen.tsx | 2287 | 91546 | M | 5be296446958a3ac37d6da1a19a13ec9e6c1a229a454e1a5df21709cdae53216 |
| src/features/profile/screens/ProfileScreen.tsx | 937 | 32772 | M | b62eac2fa183759beaafc9c48aec7738e4fed4e47c8078c9a67899ee53b4fbaf |
| src/features/socialize/screens/SocializeScreen.tsx | 285 | 10603 | clean | f93c26b8bbfab2d5ef4dd436e74daded66bc93f0d8b2eaef38a94f8ea0a21266 |
| src/shared/components/brand/AppBootScreen.tsx | 164 | 5437 | M | 82421af133151cf31702866ed891019aa39f973dbd06f9ed550ba2986fe304e5 |

## Selectors / utilities

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| src/features/activities/utils/activityLifecycle.ts | 30 | 1067 | clean | a27dee77b1d3376633b5fc84b5b0653e80d58f3eb0ad48c36dd28d7c99d84091 |
| src/features/activities/utils/activityMode.ts | 38 | 1594 | clean | 43f77f14c52bb78393d134f8097e4f7d94e7b0bb5971bfafb34e36ad14892463 |
| src/features/activities/utils/activityTiming.ts | 45 | 1642 | clean | 9ce2f6628b3c7ec26067c11af18c87bfb8eaa4cdc3b90f37a19bb379b9324d6f |
| src/features/activities/utils/activityUnderstanding.ts | 179 | 5738 | clean | 98c01ccbf674126bc37116755f69d2d758b886260924f12ed5ee378b4bd8ba82 |
| src/features/activities/utils/activityValidation.ts | 62 | 2608 | M | 44c69e6d2f88d4fd772cef391569a46da6fe9768f435a6e2f5b5647f8c560e8a |
| src/features/activities/utils/audienceSelection.ts | 299 | 11139 | ?? | 169f990dfb6147482ea45e893f886aa559743c3da15592890bc23c1755d60cc3 |
| src/features/activities/utils/categoryMemory.ts | 134 | 5038 | clean | e3509d794f32380ffb6fcc0aa94dc79533c3f009c864aae2096035e8badd4631 |
| src/features/activities/utils/currentPlace.ts | 12 | 346 | clean | 35478d410fcd50d44c3aa7b116b0b598c4f731ec96a7f3113bc48d96e791bbb6 |
| src/features/activities/utils/datetime.ts | 92 | 2526 | clean | de2698df9acf1191d4fedc594414223ce7c0424dcb311535406f511e620ab5fe |
| src/features/activities/utils/modeAccent.ts | 27 | 973 | ?? | b81f89bfc48f6e3e9012713d544f42c6fd8e84d65fbcc8eeef67b539fe73d0bf |
| src/features/activities/utils/modeDefaults.ts | 137 | 5302 | M | 8a50d798a4bc21c2dd56938e1862f70bf8e935ec599a1ff052d677467e921d0c |
| src/features/activities/utils/writeFailure.ts | 36 | 1401 | clean | 24a46c8c1e4f7720df987c9b5473779593f30183030310ea897c2e4355948575 |
| src/features/auth/utils/emailTypo.ts | 88 | 2869 | clean | 487895b0587d0f1272d32b0d7e2006bc9b939108073762cba8b2c4ae020fb727 |
| src/features/auth/utils/passwordStrength.ts | 53 | 1921 | clean | c25469c08b6e4bdeef606dbd78227145aa74ab703874df71fcfc12e2c4ef5b9e |
| src/features/auth/utils/username.ts | 82 | 2152 | M | 58cb835b0f390e86b21a4ad5f8b4d50a326c20d18a8c40f1ce0ce7a1793b2870 |
| src/features/calendar/utils/formatPlanTime.ts | 123 | 3297 | clean | 2cbb2ff2e8e58d91c0aaee2cb4b8f158c5566e2ee2cc58954dc11f5c65f246a0 |
| src/features/calendar/utils/groupPlansByDate.ts | 28 | 907 | clean | 552ee261f2a60ace434ce0e25aa7d9b2b4c64b5ba498283dd36e53d460615b62 |
| src/features/chat/utils/chatRows.ts | 95 | 3113 | clean | e5f6cbee8d07dd19e0de72b263dbacc79f173a59df5bdf1a67eb86ecebea7f37 |
| src/features/map/utils/activityCategories.ts | 37 | 1423 | clean | 2c7c0d7ebae69d4b702f14f126a6f7e9b37fed29ba7c6d585215dae2933d77c1 |
| src/features/map/utils/countdown.ts | 41 | 1633 | clean | 3e53136363c24c42029f087b803fabc268b3bfc4a6f8c42ee441d75cac0f96fa |
| src/features/map/utils/defaultRegion.ts | 8 | 222 | clean | 6a6d6b54ff3e0ab6d9a37c626646f015b01171fb9e847e0bac67fea211e93dd8 |
| src/features/map/utils/mapProvider.ts | 42 | 2187 | ?? | 0428c9f4c5100a5dbf72197d135aac1adbf51f93af7f5c2832f54b7bc251f4fd |
| src/features/map/utils/mapSelection.ts | 210 | 7295 | M | 759965ed1e120a41ecc808f194fabea5a037b6b909811cd65088312f23a89b47 |
| src/features/map/utils/markerDetailLevel.ts | 112 | 3742 | clean | 39953cf1ac0b0c04c395c155c1726fe76cf4c010f619bd2439ff5a2d3c4c21a7 |
| src/features/map/utils/markerParticipants.ts | 32 | 1149 | clean | 27f75a5c65ceba2a9cec4cd9c19f63cb5aa991a83758246c98cf993d7ed41a71 |
| src/features/map/utils/markerStyles.ts | 54 | 1507 | M | 0ae3de98054de1566c3f5873c4163d96ca8377412dec085851b482fab812c68c |
| src/features/map/utils/nearbySelectors.ts | 103 | 4536 | clean | ed089f8e3b4263cc7f754bbdadadb4ff3c114a931eedcf5b3d2b25d79f387b7f |
| src/features/map/utils/stockMapStyles.ts | 34 | 1516 | clean | 49a6ddeb3d30e2bbda430ed2ef05bacac49936acf0bf9397c6efa42a1406686e |
| src/features/map/utils/streetLightColors.ts | 41 | 1834 | clean | ff298fa4f6b3841241d537427b33fba4eec42025f112d2834772484afd0ff014 |
| src/features/map/utils/sunMapStyles.ts | 845 | 40931 | clean | 65c5fc9327a412478310f93a75a58390103cb454e50459c1cf53a36840bf2c74 |
| src/features/map/utils/sunPhase.ts | 110 | 4292 | clean | d241316384894fee48bc7184232cc015e91466e0b1cccc0beb949e60e4af1b0e |
| src/features/time-planning/utils/intervals.ts | 96 | 3652 | ?? | d7680f4ea7dc9d60c1cd1ac35c36bf07a72534e3c4649f0c9bb6e9c625c8cf12 |
| src/features/time-planning/utils/timePlanDraft.ts | 34 | 1305 | ?? | 775441db433ea7251fa3a5e81b95ab29fa772d77b5b5edba3423d388baa58d2d |
| src/shared/utils/buildInfo.ts | 78 | 3037 | M | 66b4d796c52dbf3e3dded331a893833c18f1eea8f73397f6203c683aa8037b44 |
| src/shared/utils/contrastColor.ts | 48 | 1853 | M | 1ee691c23328972fd39bc890fb2dd4265c3e28c9ff2b0d3e35ca0e0db84345f2 |
| src/shared/utils/haptics.ts | 54 | 2089 | clean | d4669c9b136fefe72bd530dc416073844ce24f6e83181cf6d18d1ab74d9b4afb |
| src/shared/utils/locationPermission.ts | 33 | 1107 | M | 6b9e5b209c4f1727017f7316ece0eebf428afd33765e7894692204c163f69fd7 |
| src/shared/utils/README.md | 5 | 164 | clean | 6341926500345190ca72893a03761ae9606b611bbd39c4cdd33a77bae1c3f387 |
| src/shared/utils/semanticColors.ts | 26 | 947 | M | 9f2d1a8bacecade236009acd63d32c1e43e8f7e3c0d551764cd8d7ec100093a6 |

## Services / Firebase seams

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| src/features/activities/services/activityService.ts | 10 | 439 | clean | 0291a821ea25edff0860c7644194da15921ca9281cea33f67a9db1de95b262cf |
| src/features/activities/services/activityService.types.ts | 128 | 4642 | clean | 0280c7326d6e24a0b30b8786cdcf0bbb8e7dcb9d602880630cdf43e89d0ad90b |
| src/features/activities/services/firebaseActivityService.ts | 219 | 7327 | clean | cc9bef89858e2e8d5798341d822c5f9523aee42689b43436f0c7812cb7650731 |
| src/features/auth/services/authErrors.ts | 94 | 4338 | M | a9e0dade21ba3fc142fc995779b8e8a6b5f3a3cff67914aaa9016895af0fcbe6 |
| src/features/auth/services/authService.ts | 14 | 538 | clean | 4ec75d95a07d54490f8d773a21e9b702301e4f43960ae78b4cf19173885de4fa |
| src/features/auth/services/firebaseAuthService.ts | 481 | 16679 | M | e25e3cf7c0179a81e3574c97ac6f2ef61a46d81a56f6d3cf54a2fb7f51fd856a |
| src/features/auth/services/socialAuth.native.ts | 118 | 3543 | clean | ea4cb36eb9a48dcd03d69f4196a6994744bc3a7449445927563f204e0a49d629 |
| src/features/auth/services/socialAuth.ts | 2 | 37 | clean | 8b82c9825bac8737663dadf456298c6e29299d4ee0500877c8c24fd12709c8c5 |
| src/features/chat/services/chatService.ts | 10 | 407 | clean | 4ffd993cacffb72371a1c19dcc4d5cd42a421bea61323915b56ae7a9dc4b9869 |
| src/features/chat/services/chatService.types.ts | 155 | 6411 | clean | be15bdd61c29b5234c24a9be8fa96065f4137e08975c9972b5f0e85564392686 |
| src/features/chat/services/firebaseChatService.ts | 534 | 17823 | clean | 5dec4f0b0a3e67810644888e1af727b0ef5ffc9f7fbac6ada8aa69efebb7148c |
| src/features/chat/services/messageCache.ts | 71 | 2155 | clean | 29fb1aba502e67addff1f64a9f9c7a42fd967de2724b6194fee4c389af025365 |
| src/features/chat/services/roomCache.ts | 52 | 1584 | clean | 5eb17516bf31ad9fe74cc2c376cb65e49fabd5e04e9df1c36bd8741625777f30 |
| src/features/circles/services/circleCache.ts | 64 | 1969 | clean | b718233a680cedc967b5cc4d67938777211205468aeb4acf012dc744518216fb |
| src/features/circles/services/circleService.ts | 10 | 423 | clean | e912af50f341df69f3d9dab5dba7724aebc364818b67e93a071558e29f3d1e29 |
| src/features/circles/services/circleService.types.ts | 26 | 848 | clean | 8fb30922d2c2cc2e8d05605c229523150d64a3a637d49c6fb967992d78694770 |
| src/features/circles/services/firebaseCircleService.ts | 72 | 2252 | clean | cb28d10c7578b78f832a9180c809949cea19dc020b555eda224d2cb72427ee0b |
| src/features/friends/services/firebaseFriendService.ts | 204 | 6783 | M | 3b6fb26a1b68921b86dd32ecab575631728d210bc5ebaa8ba750039886a8b65f |
| src/features/friends/services/friendService.ts | 6 | 247 | clean | 273f4685c1794689bd371e1b0340303aa0ec674c5669ca514be91cb796123f1a |
| src/features/friends/services/friendService.types.ts | 118 | 4879 | M | 43e3f5c8638c100415add5609028c4cafed119f634b8897bb29ca4ecfcf84c91 |
| src/features/friends/services/friendshipCache.ts | 95 | 3129 | clean | bb67be415a9939b58aeb8c477a14542479eecb38b5a3222157e1c9e16dc3fa99 |
| src/features/journey/services/firebaseJourneyService.ts | 100 | 3567 | clean | 994240d4e56fdcbdf34fbf99a6fd08f10d487e36b19ebe109a25b390002f9bf1 |
| src/features/journey/services/journeyService.ts | 5 | 200 | clean | 456966b4abbd2631f67e33ea9472054047af9ea1f45e03bcf048f5e6407bc8e4 |
| src/features/journey/services/journeyService.types.ts | 41 | 1113 | clean | 06384e5806ac2ef7b8cc691cde305f987612ea4b7cb5cb09fa2b69105bd22123 |
| src/features/moderation/services/firebaseModerationService.ts | 57 | 1809 | clean | 3f8f504303b378520ea4f2d843e26a3b94445395d19852da031c1ce3d7279b0a |
| src/features/moderation/services/moderationService.ts | 5 | 221 | clean | 24f432647a7685b69b381ad77d4d9d2316bb4f2e71679d298142058f2ebc0d92 |
| src/features/moderation/services/moderationService.types.ts | 24 | 879 | clean | bc561057b44f3f649947c810d78265f22270ef60d969c8f0086d58b5b3608bec |
| src/features/notifications/services/firebaseNotificationService.ts | 216 | 8272 | M | 10ffb3a0104e9ec84f2a55ca2354bccf3af635e9c8289f08f1a36caaabf5869e |
| src/features/notifications/services/notificationService.ts | 5 | 235 | clean | 35d8c792dbc4a91e6b523d95a2da9175e4d09361a7d9e8f59fc245caa2d2ed22 |
| src/features/notifications/services/notificationService.types.ts | 65 | 1806 | M | 371114fdc5cb416f958f4b254faa3fd8017f9d65813820eb7403334ff891a0cd |
| src/features/places/services/firebasePlaceService.ts | 66 | 1709 | clean | cd43cb0a8fdd0e4c3b3f0548132464f8b949eef8c831a4a84585632bc97c7be5 |
| src/features/places/services/placeService.ts | 4 | 114 | clean | 7ac5625e926b3d7ed7f1d2aa67a489f87a1600985e4f363839385f29bc5e0107 |
| src/features/places/services/placeService.types.ts | 27 | 641 | clean | c0d89402811b69f8da85a0daab699f0e97fbd09939ad8ad7c5c69bfd5a4cde33 |
| src/features/presence/services/firebasePresenceService.ts | 85 | 2516 | clean | 4e54c201bda93561c18bd31fe6a471cf9ef829afad962b971c6cefe9309cce56 |
| src/features/presence/services/presenceService.ts | 5 | 207 | clean | 3508a51a838568a40c09fb1fc92278eac08dca08e23729c8612a27afacd77886 |
| src/features/presence/services/presenceService.types.ts | 60 | 1816 | clean | a7b209a1c750749364003f0fca8bce5467a2fd05f40377bf10402acf39db3b7f |
| src/features/safety/services/rtdbSafetyService.ts | 244 | 9140 | clean | 0945e79e87923a6055562ccc74aa8e4c49270039bd08bc17a0478d0d68b22aaf |
| src/features/safety/services/safetyService.ts | 10 | 411 | clean | 0a90a285fa4e71cec3089eb420f61e469253e1f2d03e61e66728586f9e59c71e |
| src/features/safety/services/safetyService.types.ts | 45 | 2241 | clean | f2ef7db46f4fa3a1a9cb9abdfe749ebd2600fb62c11194a4ccff7e0d7352c79e |
| src/features/socialize/services/firebaseSocializeService.ts | 58 | 2039 | clean | cd0a721006b1facd18ca89d76461869555d39d8df1afd029ce0da5f103c6d81f |
| src/features/socialize/services/socializeService.ts | 5 | 214 | clean | db626a54400e00729fca522047b132312566c0e21812442fc49adf8f6b9f93f9 |
| src/features/socialize/services/socializeService.types.ts | 18 | 779 | clean | 9d3e2ad8c9c65511499de5aa2aed12c5417c0f6c01dd77a224a36f480f145ec1 |
| src/features/time-planning/services/firebaseTimePlanningService.ts | 175 | 5693 | ?? | f8f7477384b131dc08e5e98880754287fe7a87a33a1454659de2cb755a840f4f |
| src/features/time-planning/services/timePlanningService.ts | 6 | 317 | ?? | 819709d6fa10a3e1d9289721ca9a701c4ffc0f83e836c25fd13acb7b489d1c5e |
| src/features/time-planning/services/timePlanningService.types.ts | 38 | 1015 | ?? | cbdf480648083b8623d4bd94d62de0ecb66030e82b5a14aa1827830937bd6992 |
| src/shared/services/crashReporting.ts | 63 | 2176 | clean | 9afea3c85be9f4c84bfa718da472bfe01d9f9f3555a086ae10c9626d748f544c |
| src/shared/services/firebase.ts | 284 | 11080 | clean | b833f00036a31785e6179d48c73bb5062c59a70b6176af205297db6e5d87b593 |

## Sheets / modals

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| src/features/activities/components/ActivityComposerSheet.tsx | 1238 | 49616 | M | 80fd6064c8890fec5e8df5a10e7f488293ac8190fb54de8ab0c336d3edcb0041 |
| src/features/auth/components/ProfileEditSheet.tsx | 412 | 16285 | M | d475543b74bf2a5f2a461b8d4d795f7f3c9cc09d32e89917004df0d5582c325e |
| src/features/chat/components/ChatRoomInfoSheet.tsx | 837 | 36406 | M | 60e81804cfeab8e17579b04e2df1225c70a54128fd8c2d0131fa3f41ebc486eb |
| src/features/friends/components/FriendCodeSheet.tsx | 72 | 3040 | M | 40406ceef300a45df654d9375bdfdf17c5876d4abb994a32a3cc83badbb9a3c4 |
| src/features/mailbox/components/PostfachSheet.tsx | 1681 | 59207 | M | 3a84c265af4d7661b58f8a871a4e8444e2883d147084099b6263002eeb730262 |
| src/features/moderation/components/BlockedUsersSheet.tsx | 151 | 6313 | M | 0d7c2d9ba82957562360cc37a13d2be0427f242c05de42ee0a78317759747f31 |
| src/features/moderation/components/SafetyActionsSheet.tsx | 144 | 5238 | M | d88df13c55b393e263834f0727fb26f91495787c5a18b627582e8d526e60d509 |
| src/features/overlay/components/FloatingSheet.tsx | 392 | 15385 | ?? | 3b82b3d366e19299879de22d57b23223201cc2d9bb00507579945d04e6bdf745 |
| src/features/overlay/components/markerDetail/ParticipantProfileSheet.tsx | 172 | 6064 | M | 787e8a7704ec42c4bee483db66dd17142ce78b295a4b411823be3c5ba7f3e14f |
| src/features/overlay/components/MarkerDetailSheet.tsx | 438 | 18212 | M | 137f4dc0ec87316b8611f85d8889d46cdbf2a4ab0660999b39a6627fa419ba0f |
| src/features/overlay/components/NearbySheet.tsx | 595 | 21399 | M | 12e15d09269ec06920d7dbfd588619ed0a2150baf9de7e225311380d79201991 |
| src/features/overlay/components/OpenStatusSheet.tsx | 153 | 6322 | ?? | 4faef63cd2aebba3ea0ab9a6be7725ef8f5a1f248809f31cd74a2067585b00ba |
| src/features/overlay/components/SpontaneousRoundInviteSheet.tsx | 240 | 9147 | M | d8a9ac2622d927dd743190afd42c3aeda0d2bab833cacb99ee311223ee919e25 |
| src/features/overlay/components/SpontaneousRoundSheet.tsx | 220 | 8320 | M | 545aa4a8c5e7233587767f8a0e2e8fc2a05b5c39a9846cc154bbad131c8a4517 |
| src/features/safety/components/SafetyAudienceSheet.tsx | 470 | 16658 | M | ba19f871a71479d234b851f62d9d24afd4401766fee0dbccff0cb81234723c00 |
| src/features/safety/components/SafetyCompanionSheet.tsx | 396 | 15085 | clean | e8ef03d4d247c3bc846ec1a66139291bb578660fb2db17ebf9cec1043875f6c0 |
| src/features/safety/components/SafetyStartSheet.tsx | 559 | 23340 | M | 00620a9089b07bb1cac8dcbbd05c597d0316373a87b0abde4bad3f967349fb24 |
| src/features/settings/components/PrivacyInfoSheet.tsx | 134 | 4977 | M | efdc07a029174cb2cdf19b3cc4db8233cc82116f54dac929cdf7570c466a40ed |
| src/features/socialize/components/MatchChatSheet.tsx | 178 | 6799 | clean | b71d49ebc955fe6204be34162e7852b153b7dcd1f8103a53ecd237e1db172e4b |
| src/features/time-planning/components/TimePlanningSheet.tsx | 706 | 27836 | ?? | f56b1b9ca60e41b78bbab06d45d16a6cfb506a795b0bdd32b551c04b5db897a4 |

## Storage Rules

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| storage.rules | 23 | 511 | clean | f8524919a5da18f0b525ec48709536efe5f5c5b4042157513bf266395ca9b7e5 |

## Tests

| Path | Lines | Bytes | Git | SHA-256 |
| --- | ---: | ---: | --- | --- |
| firebase.auth-storage.test.json | 10 | 235 | clean | 7dd0e9b9ad52ebb1f40a1504ef2f288644ad156930aa484a9388d6972229e6ee |
| firebase.firestore.test.json | 12 | 256 | clean | 8fcfda62c617c03858e939b72142c33dfa126269d912f8cbbea8e4813289a623 |
| firebase.functions.test.json | 20 | 640 | clean | 9ad7447992e790b9181f0ce30d55a23e0766eb54a0a1802e6dae1cb75a6889f5 |
| firebase.test.json | 11 | 217 | clean | 1fbcba34b1c969e58aa54a34eb3b17621b150598cd55111c2731d2d146724694 |
| scripts/test-activity-backfill.mjs | 124 | 4390 | clean | 88e18007989b5bbc16059239cefe18784863a5ff6154abcd492f67407963d6f2 |
| scripts/test-audience-selection.mjs | 290 | 11818 | ?? | d8f77b29f87813b884d39748a8e9866e826c0b3b3d9cdaeb839fedb7166eee69 |
| scripts/test-core-selection.mjs | 343 | 11810 | ?? | 4cc40b1880031d4613ca63ac25e06d123d68648f7bf4f64457dbebd97b95af67 |
| scripts/test-email-verification-gate.js | 140 | 5061 | clean | 1cb53872dd90e91e584bfdf00ec453c446da2867b1a4e852eed8193c04f8bf17 |
| scripts/test-firestore-rules.js | 451 | 17080 | M | 9f9ee042a62fd5fbb532afecc809472eb73bb37de99886d46384c4510506e0d0 |
| scripts/test-friend-search.mjs | 36 | 1272 | ?? | 4463cc7d373b71974146d660294683d6a61fa632f22c9fed55cbfee66035eb07 |
| scripts/test-functions.js | 2751 | 111893 | M | eac6a71e084463559d1dc28503892e5b14059091c7a98c510a8e73f15b7749ba |
| scripts/test-journey-rtdb.js | 340 | 10905 | clean | 9e8651d221d626ca0dc6b4fe9a532be540fba213e4fea4ad14334382e1de8967 |
| scripts/test-safety-task.js | 58 | 1892 | clean | 9efb1e5b95b3f2427a117074f6fb5f9d87e97f700ac28466bdd9a485818b48ef |
| scripts/test-storage-rules.js | 115 | 3923 | clean | abe3cb638caba66cf5f2742fc89f793b730efff5d503c01316fe747a1ced9c30 |
