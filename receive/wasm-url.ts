// The decoder wasm is a separate asset so the browser and service worker can
// cache it without inflating the main SPA bundle.
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

export default wasmUrl;
