# Expo SDK 57 (v57.0.0 docs) — Verified API Reference

Every fact below was read from the versioned Markdown docs (`https://docs.expo.dev/versions/v57.0.0/...`, `.md` suffix) or the router guide pages named in each section. Page `modificationDate` values range July–September 2026. Nothing here is from memory.

**URL correction:** `https://docs.expo.dev/router/basics/layout.md` **404s**. The correct page is
`https://docs.expo.dev/router/basics/navigation-layouts.md` (titled "Navigation layouts in Expo Router", linked as "Layout" in the Router 101 sidebar). Section G uses that page.

---

## A. expo-file-system — the "new" (SDK 54+) class API vs legacy

```ts
// NEW API — this is what the docs' Usage section and every example import.
import { File, Directory, Paths } from 'expo-file-system';

// LEGACY API — only reachable through the /legacy subpath.
import * as FileSystem from 'expo-file-system/legacy';
```

Every legacy root-level function is documented as:

> **Deprecated:** Use `new File().copy()` or import this method from `expo-file-system/legacy`. **This method will throw in runtime.**

So in SDK 57, calling `FileSystem.copyAsync(...)` / `getInfoAsync` / `deleteAsync` / `makeDirectoryAsync` / `readAsStringAsync` / `writeAsStringAsync` / `downloadAsync` / `uploadAsync` from the **root** import throws at runtime. The doc's separate example is literally titled "Using legacy FileSystem API" and imports from `expo-file-system/legacy`. The docs never print a sentence starting "we recommend", but the class API is what the package root exports and what all Usage examples use.

### Key types

| Type | Notes |
| --- | --- |
| `File` | `new File(...uris)` where each arg is `string \| File \| Directory`. Doc: "does not need to exist"; throws from the constructor only if the wrong class is used for an existing path. Props: `exists: boolean`, `size: number`, `uri: string`, `name`, `extension`, `type` (MIME), `lastModified: number \| null`, `creationTime: number \| null`, `modificationTime: number \| null`, `md5: string \| null` (**deprecated** in favor of `lastModified`), `parentDirectory: Directory`, `contentUri` (Android). |
| `Directory` | `new Directory(...)`; `exists: boolean`, `size: number \| null` (null if missing/unreadable), `uri: string` (read-only), `name`, `parentDirectory`. |
| `Paths` | class extends `PathUtilities`. Props: `Paths.document`, `Paths.cache`, `Paths.bundle` (all `Directory`), `appleSharedContainers: Record<string, Directory>`, `availableDiskSpace: number`, `totalDiskSpace: number`. Methods: `join(...paths): string`, `basename(path, ext?)`, `dirname(path)`, `extname(path)`, `normalize(path)`, `parse(path)`, `relative(from, to)`, `isAbsolute(path)`, `info(...uris): PathInfo`. |

### The six requested operations

**(1) File size in bytes**
```ts
const file = new File(uri);
const bytes = file.size;         // number — "0 if the file does not exist, or it cannot be read"
const viaInfo = file.info().size; // File.info(options?: InfoOptions): FileInfo ; InfoOptions = { md5?: boolean }
const dirBytes = new Directory(dirUri).size; // number | null
```
(For an image the picker already returned, `asset.fileSize` is the byte count — see section C.)

**(2) Check a file exists**
```ts
if (new File(uri).exists) { /* ... */ }   // also false when the app lacks read access
new Directory(dirUri).exists;
Paths.info(uri);                          // PathInfo = { exists: boolean; isDirectory: boolean | null }
```

**(3) Copy / move a file into the document directory**
```ts
file.copy(destination: File | Directory, options?: RelocationOptions): Promise<void>
file.copySync(destination, options?): void
file.move(destination: File | Directory, options?): Promise<void>  // updates file.uri
file.moveSync(destination, options?): void
// RelocationOptions = { overwrite?: boolean }   // default false
```
Doc example (adapted):
```ts
const file = new File(Paths.cache, 'picked.jpg');
file.copy(new File(Paths.document, 'picked.jpg'));  // explicit destination file
file.move(Paths.document);                          // or move into the dir, filename kept
```
`Directory` exposes the same four methods.

**(4) Document directory path — the persistent-directory accessor is `Paths.document`**
```ts
Paths.document       // Directory — "a place to store files that are safe from being deleted by the system"
Paths.document.uri   // string
Paths.cache          // Directory — can be deleted by the system when storage runs low
Paths.bundle         // Directory — assets bundled with the app
```
`FileSystem.documentDirectory` (the legacy string constant) **is not documented anywhere on the v57 filesystem page** — the identifier appears only inside `${documentDirectory}` comments. If you keep legacy code, use `expo-file-system/legacy`.

**(5) Create a directory**
```ts
const dir = new Directory(Paths.document, 'images');
dir.create(options?: DirectoryCreateOptions): void   // synchronous, returns void
// DirectoryCreateOptions = { idempotent?: boolean; intermediates?: boolean; overwrite?: boolean } — all default false
```
"Creates a directory that the current uri points to." With defaults it throws if the target already exists; pass `{ idempotent: true }` to make it safe to repeat. Also available: `Directory.createDirectory(name): Directory`, `Directory.createFile(name, mimeType): File`.

**(6) Delete a file**
```ts
new File(uri).delete();        // void (synchronous, returns void)
new Directory(uri).delete();   // void — "Also deletes all files and directories inside the directory"
```

### Other confirmed members

`File.create(options?: FileCreateOptions): void` (`{ intermediates?, overwrite? }`), `File.text(): Promise<string>` / `File.textSync(): string`, `File.write(content: string | Uint8Array, options?: FileWriteOptions): void` (`{ append?, encoding? }`), `File.bytes()/bytesSync()`, `File.base64()/base64Sync()`, `File.open(mode?: FileMode): FileHandle`, `File.downloadFileAsync(url, destination)`, `File.createDownloadTask(url, destination, options?)`, `File.pickFileAsync(options?)` (Android), `Directory.list(): (File | Directory)[]`.

Legacy equivalents (all via `expo-file-system/legacy`): `getInfoAsync`, `copyAsync`, `moveAsync`, `makeDirectoryAsync`, `deleteAsync`, `readAsStringAsync`, `writeAsStringAsync`, `readDirectoryAsync`, `downloadAsync`, `createDownloadResumable`, `uploadAsync`, `getContentUriAsync`, `getFreeDiskStorageAsync`, `getTotalDiskCapacityAsync`, `deleteLegacyDocumentDirectoryAndroid`.

Platforms for the new API: Android, iOS, tvOS (**no web**).

---

## B. expo-sqlite

```ts
import * as SQLite from 'expo-sqlite';
```

### Open
```ts
const db = await SQLite.openDatabaseAsync(databaseName: string, options?: SQLiteOpenOptions, directory?: string); // Promise<SQLiteDatabase>
const db  = SQLite.openDatabaseSync(databaseName, options?, directory?);                                          // SQLiteDatabase
```
`SQLiteOpenOptions = { enableChangeListener?: boolean; useNewConnection?: boolean; libSQLOptions?: { url, authToken, remoteOnly } }`. `directory` defaults to the exported `defaultDatabaseDirectory` and is not supported on web. `SQLiteDatabase` also has `databasePath`, `nativeDatabase`, `options`, `closeAsync()`, `closeSync()`, `isInTransactionAsync()/Sync()`.

### DDL / multi-statement
```ts
await db.execAsync(source: string): Promise<void>;   // sync: db.execSync(source): void
```
> "Note: The queries are not escaped for you! Be careful when constructing your queries."

Use for DDL/PRAGMA: `await db.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS ...')`.

### Parameterized queries
```ts
db.runAsync(source, params): Promise<SQLiteRunResult>          // runSync → SQLiteRunResult
db.getAllAsync<T>(source, params): Promise<T[]>                // getAllSync → T[]
db.getFirstAsync<T>(source, params): Promise<T | null>         // getFirstSync → T | null
db.getEachAsync<T>(source, params): AsyncIterableIterator<T>   // getEachSync → IterableIterator<T>
```
`params` accepts all three documented forms:
```ts
await db.runAsync('UPDATE test SET intValue = ? WHERE value = ?', 999, 'aaa');       // variadic
await db.runAsync('UPDATE test SET intValue = ? WHERE value = ?', [999, 'aaa']);     // array
await db.runAsync('DELETE FROM test WHERE value = $value', { $value: 'aaa' });       // named object ($ recommended)
// SQLiteRunResult = { lastInsertRowId: number; changes: number }
```

### Prepared statements
```ts
const statement = await db.prepareAsync(source): Promise<SQLiteStatement>;  // prepareSync(source): SQLiteStatement
try {
  const result = await statement.executeAsync<{ value: number }>({ $value: 'bbb' });
  // result.lastInsertRowId, result.changes; also result.getFirstAsync(), result.getAllAsync(), result.resetAsync()
  // SQLiteExecuteAsyncResult<T> extends AsyncIterableIterator<T> → usable in for await...of
} finally {
  await statement.finalizeAsync();   // sync path: statement.finalizeSync()
}
```
`SQLiteStatement` also has `executeSync(params): SQLiteExecuteSyncResult<T>` with `getFirstSync/getAllSync/resetSync`, `finalizeAsync()`, `finalizeSync()`.

### Transactions
```ts
await db.withTransactionAsync(task: () => Promise<void>): Promise<void>;                    // NOT exclusive
await db.withExclusiveTransactionAsync(task: (txn: Transaction) => Promise<void>): Promise<void>;
db.withTransactionSync(task: () => void): void;
```
- `withTransactionAsync` — "This transaction is not exclusive and can be interrupted by other async queries." The docs show a `Promise.all` example where an outside query lands inside the transaction and rolls it back. Do not use it when ordering matters.
- `withExclusiveTransactionAsync` — "Any queries inside the transaction must be executed on the `txn` object. The `txn` object has the same interfaces as the `SQLiteDatabase` object." **Not supported on web.** Other async writes abort with `database is locked`.
- `withTransactionSync` also documented.

### Is there a synchronous API? Yes — a complete one
`openDatabaseSync`, `execSync`, `runSync`, `getAllSync`, `getFirstSync`, `getEachSync`, `prepareSync`, `withTransactionSync`, `closeSync`, `isInTransactionSync`, `serializeSync`, `deleteDatabaseSync`. Every one carries: "Running heavy tasks with this function can block the JavaScript thread and affect performance."

### Extras worth knowing
- Tagged templates (Bun-style, auto-escaped): `const sql = db.sql;` then `await sql<User>\`SELECT * FROM users WHERE age > ${age}\`` → `User[]`; `.first()`, `.values()`, `.each()`; sync: `.allSync()`, `.firstSync()`, `.valuesSync()`, `.eachSync()`.
- React: `<SQLiteProvider databaseName="test.db" onInit={migrateDbIfNeeded} useSuspense?>` + `const db = useSQLiteContext();` (returns `SQLiteDatabase`).
- Module-level: `SQLite.deleteDatabaseAsync(name, directory?)`, `SQLite.backupDatabaseAsync`, `SQLite.deserializeDatabaseAsync`, `SQLite.addDatabaseChangeListener(listener)`, `SQLite.bundledExtensions`.
- Binary: pass `Uint8Array` as a bind value, read back as `Uint8Array`.
- Dev-only on-device DB inspector: press `Shift + M` in the Expo CLI terminal → "Open expo-sqlite".

---

## C. expo-image-picker

```ts
import * as ImagePicker from 'expo-image-picker';

const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ['images'],        // MediaType[] | MediaType | MediaTypeOptions; default 'images'
  allowsEditing: true,           // Android/iOS; default false
  aspect: [4, 3],                // [number, number]
  quality: 1,                    // 0..1, default 1.0
  allowsMultipleSelection: false,// default false; mutually exclusive with allowsEditing
  selectionLimit: 0,             // default 0 = system max
  base64: false,
  exif: false,
});

if (!result.canceled) {
  const { uri, width, height, fileSize, mimeType } = result.assets[0];
}
```

`launchImageLibraryAsync(options?: ImagePickerOptions): Promise<ImagePickerResult>`
`launchCameraAsync(options?: ImagePickerOptions): Promise<ImagePickerResult>`
`getPendingResultAsync(): Promise<ImagePickerErrorResult | ImagePickerResult | null>` (Android MainActivity-killed recovery)

### Result shape
`ImagePickerResult = ImagePickerSuccessResult | ImagePickerCanceledResult`
```ts
// success
{ canceled: false, assets: ImagePickerAsset[] }
// canceled
{ canceled: true,  assets: null }
```

`ImagePickerAsset` fields:
| Field | Type | Note |
| --- | --- | --- |
| `uri` | `string` | required |
| `width` | `number` | required — "Can be `0` if the system did not provide the width" |
| `height` | `number` | required — same `0` caveat |
| `fileSize` | `number` (optional) | "File size of the picked image or video, in bytes." |
| `mimeType` | `string` (optional) | described as "`null` if could not be determined" |
| `fileName` | `string \| null` | optional |
| `assetId` | `string \| null` | Android/iOS |
| `type` | `'image' \| 'video' \| 'livePhoto' \| 'pairedVideo' \| null` | optional |
| `base64` | `string \| null` | only when `base64: true` |
| `exif` | `Record<string, any> \| null` | only when `exif: true` |
| `duration` | `number \| null` | video length in ms |
| `pairedVideoAsset` | `ImagePickerAsset \| null` | iOS live photos |
| `file` | web `File` | web only |

### All `ImagePickerOptions` field names
`allowsEditing`, `allowsMultipleSelection`, `aspect`, `base64`, `cameraType`, `defaultTab` (Android), `exif`, `legacy` (Android), `mediaTypes`, `orderedSelection` (iOS 15+), `preferredAssetRepresentationMode` (iOS 14+), `presentationStyle` (iOS), `quality`, `selectionLimit`, `shape` (Android), `shouldDownloadFromNetwork` (iOS), `videoExportPreset` (deprecated), `videoMaxDuration`, `videoQuality` (iOS).

`mediaTypes`: `MediaType = 'images' | 'videos' | 'livePhotos'`. The string-array form is current; `MediaTypeOptions` (`All`/`Images`/`Videos`) is the deprecated path.

### Permissions
- **Hook name: `ImagePicker.useMediaLibraryPermissions(options?)`** → `[status, requestPermission, getPermission]`.
- Camera hook: `ImagePicker.useCameraPermissions(options?)`.
- Functions: `requestMediaLibraryPermissionsAsync(writeOnly?: boolean)` / `getMediaLibraryPermissionsAsync(writeOnly?)` → `MediaLibraryPermissionResponse` (extends `PermissionResponse` with `accessPrivileges?: 'all' | 'limited' | 'none'`); `requestCameraPermissionsAsync()` / `getCameraPermissionsAsync()`.
- SDK 57 note: with the SDK 54+ defaults (`allowsEditing: false`, `videoExportPreset: 'Passthrough'`) iOS shows a permission dialog right after a video is selected, so the docs say to request media-library permission **before** opening the picker.

---

## D. expo-image-manipulator — `manipulateAsync` IS deprecated in SDK 57

Verbatim deprecation note:

> **Deprecated:** It has been replaced by the new, contextual and object-oriented API. Use `ImageManipulator.manipulate` or `useImageManipulator` instead.

`ImageManipulator.manipulateAsync(uri: string, actions?: Action[], saveOptions?: SaveOptions): Promise<ImageResult>` is still documented (with `ActionResize`, `ActionRotate`, `ActionFlip`, `ActionCrop`, `ActionExtent`), but new code should use the context API:

```ts
import { useImageManipulator, SaveFormat } from 'expo-image-manipulator';
// non-hook form: import * as ImageManipulator from 'expo-image-manipulator'; ImageManipulator.manipulate(uri)

const context = useImageManipulator(uri);      // ImageManipulatorContext
context.resize({ width: 1024, height: null }); // one side may be null → other computed to keep ratio
const rendered = await context.renderAsync();  // Promise<ImageRef>
const result = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
// result: { uri: string; width: number; height: number; base64?: string }
```

- `useImageManipulator(source): ImageManipulatorContext` — hook, `source: string | SharedRef<'image'>`.
- `ImageManipulator.manipulate(source): ImageManipulatorContext` — non-hook equivalent.
- `ImageManipulatorContext` (synchronous, chainable, each returns the context): `resize(size: { width: number \| null; height: number \| null })`, `rotate(degrees: number)` (clockwise positive), `flip(flipType: 'vertical' | 'horizontal')` (also `FlipType.Vertical` / `FlipType.Horizontal`), `crop(rect: { originX, originY, width, height })`, `extent(...)` (Web only), `reset()`, `renderAsync(): Promise<ImageRef>`.
- `ImageRef`: `width: number`, `height: number`, `saveAsync(options?: SaveOptions): Promise<ImageResult>` — "Saves the image to the file system in the cache directory."
- `SaveOptions = { base64?: boolean; compress?: number /* 0.0–1.0, 1 = no compression */; format?: SaveFormat }`.
- `SaveFormat = { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' }` — JPEG is the default.

Because `saveAsync` writes to the **cache** directory, copy the result to `Paths.document` with expo-file-system if it must survive.

---

## E. expo-image

```tsx
import { Image } from 'expo-image';

<Image
  source={{ uri: 'file:///var/mobile/.../photo.jpg' }}
  style={{ width: 200, height: 200 }}
  contentFit="cover"
/>
```

- Component name: **`Image`** (a `React.PureComponent<ImageProps>`). `ImageBackground` also exists.
- `source` accepts `number | ImageSource | string | SharedRef<'image'> | ImageSource[] | string[] | \`sf:<symbol>\``. `ImageSource = { uri?: string; width?: number | null; height?: number | null; blurhash?; thumbhash?; cacheKey?; headers?; isAnimated?; webMaxViewportWidth? }`. A local file URI goes in `source={{ uri }}` (a bare string also works). Native resources load by name: `source={{ uri: 'app_icon' }}` (no extension).
- `contentFit?: ImageContentFit`, default `'cover'`. Values: `'cover'`, `'contain'`, `'fill'`, `'none'`, `'scale-down'`. Mirrors CSS `object-fit`; pair with `contentPosition` (default `'center'`).
- `resizeMode` still exists but is deprecated: "Provides compatibility for `resizeMode` from React Native Image… Use the more powerful `contentFit` and `contentPosition` props instead." The component-level note says RN-compat props "are deprecated and might be removed in the future".
- Other useful props: `placeholder`, `placeholderContentFit` (default `'scale-down'`), `transition` (number ms or `ImageTransition`), `cachePolicy` (`'none' | 'disk' | 'memory' | 'memory-disk'`, default `'disk'`), `allowDownscaling` (default `true`; never applied when `contentFit` is `'none'` or `'fill'`), `onLoad`, `onError`, `onDisplay`, `priority`, `recyclingKey`, `blurRadius`, `tintColor`.
- Module functions/hooks: `Image.prefetch(urls, cachePolicy?)`, `useImage(source, options?, dependencies?)`, `Image.loadAsync`, `Image.writeToCacheAsync` / `readFromCacheAsync` (Android/iOS).

---

## F. expo-crypto

```ts
import * as Crypto from 'expo-crypto';

const id: string = Crypto.randomUUID();  // UUID v4 (RFC4122), SYNCHRONOUS — returns string, not a Promise
```

The name is `randomUUID()` — **not** `randomUUIDAsync()`.

Also documented: `Crypto.getRandomBytes(byteCount: number): Uint8Array` (sync, `byteCount` 0–1024 else `TypeError`), `getRandomBytesAsync(byteCount): Promise<Uint8Array>`, `getRandomValues(typedArray): T`, `digest(algorithm, data: BufferSource): Promise<ArrayBuffer>`, `digestStringAsync(algorithm, data: string, options?: CryptoDigestOptions): Promise<string>` with `CryptoDigestAlgorithm.SHA256 | SHA384 | SHA512 | SHA1 | MD5 | MD4(iOS) | MD2(iOS)` and `CryptoEncoding.HEX | BASE64`. SDK 57 also documents AES-256-GCM: `AESEncryptionKey.generate()`, `aesEncryptAsync(plaintext, key, options?)`, `aesDecryptAsync(sealedData, key, options?)`, `AESSealedData`.

---

## G. expo-router

### File conventions (docs use a `src/app` root; identical rules for `app/`)
- `src/app/_layout.tsx` — **root layout**. "Each directory within the `src/app` directory (including `src/app` itself) can define a layout in the form of a `_layout.tsx` file inside that directory." It exports a default component rendered before whatever page you navigate to inside that directory.
- `src/app/(tabs)/_layout.tsx` — tab layout. `(tabs)` is a route group; `index.tsx` inside it is the default tab, other files in the group are the other tabs.
- `src/app/products/_layout.tsx` + `index.tsx` + `[productId].tsx` — a stack scoped to a directory.

### Imports (all confirmed exported from `expo-router`)
```ts
import { Stack, Tabs, Link, router, useLocalSearchParams, useRouter } from 'expo-router';
// also exported: Redirect, Slot, useSegments, ThemeProvider, DarkTheme, DefaultTheme
import { NativeTabs } from 'expo-router/native-tabs';                        // native tab bar
import { Tabs as CustomTabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui'; // headless tabs
import { Stack as JsStack } from 'expo-router/js-stack';                     // SDK 56+ JS stack
```

### Root layout + Tabs layout
```tsx
// src/app/_layout.tsx
import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
```
```tsx
// src/app/(tabs)/_layout.tsx — how a tab sets its title AND icon
import { Tabs } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: 'blue' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="home" color={color} />,
        }}
      />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
```
Tab metadata lives in `options`: `title`, `tabBarIcon: ({ focused, color, size }) => React.Node`, `tabBarLabel`, `tabBarBadge`, `tabBarActiveTintColor`, `href: null` (keep the route but hide its tab), `href: '/evanbacon'` (dynamic `[user]` tab). Options go in `<Tabs screenOptions>` for all tabs or `<Tabs.Screen options>` for one.

### Stack layout + a screen with a custom title
```tsx
// src/app/_layout.tsx — static title set in the layout
<Stack screenOptions={{ headerTintColor: '#fff' }}>
  <Stack.Screen name="[productId]" options={{ title: 'Product', headerShown: false }} />
</Stack>
```
```tsx
// src/app/details.tsx — dynamic title from inside the screen (options API)
import { Stack, useLocalSearchParams } from 'expo-router';
export default function Details() {
  const params = useLocalSearchParams();
  return (
    <>
      <Stack.Screen options={{ title: params.name, headerStyle: { backgroundColor: 'lightblue' } }} />
    </>
  );
}
```
SDK 55+ adds an alpha composition API that is interchangeable with the options API: `<Stack.Title>{params.name}</Stack.Title>`, `<Stack.Header style={...} />`, `<Stack.Toolbar placement="right">`. `Stack` implements React Navigation's **native stack**; header options include `title`, `headerTitle`, `headerShown`, `headerStyle`, `headerTintColor`, `headerTitleStyle`, `headerLargeTitleEnabled`, `headerLeft`/`headerRight`, `headerSearchBarOptions`, `headerTransparent`; screen options include `presentation`, `animation`, `sheetAllowedDetents`, `gestureEnabled`.

### Navigation
```tsx
const router = useRouter();            // hook form
router.navigate('/about');             // push, or unwind to an existing route
router.push('/about'); router.replace('/'); router.back();
router.setParams({ limit: 50 });
router.dismiss(3); router.dismissTo('/'); router.dismissAll(); router.canDismiss();

<Link href="/about">About</Link>
<Link href={{ pathname: '/user/[id]', params: { id: 'bacon' } }}>View user</Link>
<Link href="/other" asChild><Pressable><Text>Home</Text></Pressable></Link>
<Link href="/stack/second" withAnchor>Go to second</Link>
<Link href="/about" prefetch />

const { id, limit } = useLocalSearchParams();
```
`Link` renders children inside a `<Text>` by default — use `asChild` for full layout control. `Redirect href="/about"` redirects immediately. Relative hrefs (`./article`, `../x`) work at runtime but are not supported by typed routes. Anchor route:
```tsx
export const unstable_settings = { anchor: 'index' };
```

### Typed routes
1. **Beta, not enabled by default**; quick-start Expo Router projects already have it configured. Manual enable in **app.json**:
```json
{ "expo": { "experiments": { "typedRoutes": true } } }
```
2. Run `npx expo customize tsconfig.json`, then `npx expo start`. The same customize command is the documented way to generate types on CI without starting the dev server.
3. Expo CLI generates a git-ignored **`expo-env.d.ts`**, adds it plus a hidden `.expo` entry to `tsconfig.json`'s `includes`, and updates `.gitignore`. Do not edit, commit, or remove `expo-env.d.ts`; the `includes` entries are required.
4. `Link`'s `href`, the imperative `router`, and the hooks become statically typed through `Href<T>`; `expo-router` also exports a `Route` type matching all valid routes.
5. Rules the docs state explicitly:
   - Unknown routes are type errors: `❌ <Link href="/usser/1" />`.
   - Dynamic routes must be object hrefs: `✅ <Link href={{ pathname: '/user/[id]', params: { id: 1 } }} />`, `❌ <Link href="/user/[id]" />`; unknown or extra params error.
   - **Relative paths are not supported** by typed routes (`❌ <Link href="./about" />`); use `useSegments()` to build tab-relative links, e.g. `const [first] = useSegments(); <Link href={\`/${first}/profile\`}>`.
6. Parameter typing: `useLocalSearchParams<'/(search)/[profile]/[...search]'>()`, query params via `useLocalSearchParams<{ query?: string }>()`, or both generics `useLocalSearchParams<'/[profile]/[...search]', { query?: string }>()`; `useSegments<'/(search)/profile'>()`.

---

## UNVERIFIED / UNCERTAIN

1. **404 in the brief:** `/router/basics/layout.md` does not exist (HTTP 404, empty shell). The real page is `/router/basics/navigation-layouts.md`. All other eight URLs returned 200.
2. **"Recommended" is my inference for FileSystem.** No page contains an explicit recommendation sentence. The evidence is: the root import is `{ File, Directory, Paths }`, all Usage examples use it, and every legacy root function's deprecation note ends "This method will throw in runtime." Quote the deprecation note, not a recommendation, if you need a citation.
3. **`FileSystem.documentDirectory` / `cacheDirectory` are not documented on the v57 filesystem page at all** — only `Paths.document` / `Paths.cache` are (the string `documentDirectory` appears only inside code comments such as `${documentDirectory}`). I did not fetch a separate legacy-API page, so I cannot confirm the exact legacy constant names from v57 docs; check the `expo-file-system/legacy` type declarations before relying on them.
4. **`Paths.document.uri` / `Paths.cache.uri` are type-derived, not shown verbatim** in any v57 example. They follow from `Paths.document: Directory` and `Directory.uri: string` (read-only). The docs' own examples use `new File(Paths.document, 'x')` and then `file.uri`.
5. **ImagePicker permission guidance contradicts itself.** The Usage snippet comments "No permissions request is necessary for launching the image library" and then immediately calls `requestMediaLibraryPermissionsAsync()`; the "Invoke permissions for videos" section says SDK 54+ defaults make iOS show a permission dialog right after picking, so request media-library permission *before* launching. Recommendation: request first. Also, `launchImageLibraryAsync`'s own text says it "Requires `Permissions.MEDIA_LIBRARY` on iOS 10 only".
6. **ImagePicker asset optionality is fuzzy:** the table types `mimeType?: string` and `fileSize?: number` (optional) while prose says `mimeType` is "`null` if could not be determined". Treat both as possibly absent — do not assert them as always present.
7. **Which navigator backs `Tabs` is described inconsistently:** `/router/advanced/tabs.md` says the JavaScript tabs "extend the Bottom Tabs Navigator from React Navigation"; `/router/basics/navigation-layouts.md` says "This `Tabs` component uses React Navigation's native bottom tabs". Both agree the import is `Tabs` from `expo-router` and that React Navigation bottom-tabs v7 options apply (Expo Router v6). I did not resolve which prose is correct.
8. **SQLite transaction example looks wrong:** the "Executing queries within an async transaction" snippet reads `result.rows[0]['COUNT(*)']`, but `getFirstAsync` is documented to return the row object directly (every other example uses `result?.user_version`, `row.data`). No `rows` property appears on the documented `SQLiteExecuteAsyncResult` / `SQLiteRunResult` / `SQLiteExecuteSyncResult` types. I reported the signatures, not that snippet.
9. **Sync/async FileSystem mixing in the docs' own example:** `copy`/`move` are documented as returning `Promise<void>`, but the "Moving and copying files" example calls `file.copy(copiedFile); file.move(Paths.cache);` without `await`. Treat the signatures as authoritative and `await` them.
10. **`File.size` semantics for SAF/`content://` URIs** and other platform edge cases beyond the stated "Supported platforms: Android, iOS, tvOS" lists were not verified. `expo-file-system` lists no web platform.
11. **Not verified on these pages:** the SDK 57 ↔ React Native 0.86 version pairing (none of the fetched pages states an RN version), and any API on these packages not listed above.
12. **`ImageManipulator.manipulateAsync` is documented-but-deprecated**, so it still appears in the API reference; the deprecation text does not say it throws at runtime (unlike the FileSystem legacy functions, which explicitly do).
