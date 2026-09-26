// Backend port. Deliberately NOT 8000 (uvicorn/Django/http.server default),
// so WhisperPanda never blocks other dev servers. If you change it, also
// update connect-src in src/renderer/index.html.
export const BACKEND_PORT = 47821
export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`
