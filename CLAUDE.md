# Working rules

## How the game works: check the APK, don't assume

- Do not assume game mechanics (effect layouts, formulas, AI, value meanings).
- Check the source APK first: `D:\Download\Taimanin\apk\<version>\*.apk`.
  Extract `global-metadata.dat` and `libil2cpp.so` and read the compiled
  code (IL2CPP metadata for class, field and method names, plus ARM64
  disassembly for the logic). See HANDOFF.md in `D:\Download\Taimanin` for
  the tooling.
- If the APK is missing, or older than the data being decoded (for example,
  new classes or effect kinds that aren't in its metadata), tell the user to
  get a new APK. Don't guess.
- Only when the code really isn't available may you infer behaviour from
  data or skill texts. Say so when you do.
