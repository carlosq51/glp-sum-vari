/**
 * sheets-client.js
 * Cliente Google Sheets API v4 via Service Account.
 * Sin OAuth, sin re-auth, credenciales permanentes.
 *
 * Uso:
 *   import { sheetsRead, sheetsWrite, sheetsAppend, sheetsClear } from './sheets-client.js';
 *
 * Variables de entorno requeridas (una de las dos formas):
 *   GOOGLE_SA_PATH=./service-account.json   (ruta al archivo JSON)
 *   GOOGLE_SA_JSON={"type":"service_account",...}  (contenido JSON como string)
 */

import { google } from "googleapis";
import { readFileSync, existsSync } from "fs";

// ── Autenticación ─────────────────────────────────────────────────────────────

function getAuth_() {
  const saPath = process.env.GOOGLE_SA_PATH || "./service-account.json";
  const saJson = process.env.GOOGLE_SA_JSON;

  let credentials;

  if (saJson) {
    // Opción 1: JSON en variable de entorno (para servidores en producción)
    try {
      credentials = JSON.parse(saJson);
    } catch {
      throw new Error("GOOGLE_SA_JSON contiene JSON inválido.");
    }
  } else if (existsSync(saPath)) {
    // Opción 2: archivo local
    credentials = JSON.parse(readFileSync(saPath, "utf8"));
  } else {
    throw new Error(
      `No se encontró service-account.json en "${saPath}". ` +
      `Define GOOGLE_SA_PATH o GOOGLE_SA_JSON en tu .env`
    );
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

let _sheetsClient = null;
async function client_() {
  if (!_sheetsClient) {
    _sheetsClient = google.sheets({ version: "v4", auth: getAuth_() });
  }
  return _sheetsClient;
}

// ── Operaciones ───────────────────────────────────────────────────────────────

/**
 * Leer un rango de una hoja.
 * @param {string} spreadsheetId  ID del spreadsheet (el largo string en la URL)
 * @param {string} range          Ej: "Hoja1!A1:Z100" o "A:Z"
 * @returns {Array<Array>}        Matriz de valores (filas × columnas). Vacío si no hay datos.
 */
export async function sheetsRead(spreadsheetId, range) {
  const s = await client_();
  const res = await s.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

/**
 * Escribir valores en un rango (sobreescribe).
 * @param {string} spreadsheetId
 * @param {string} range          Ej: "Hoja1!A2"
 * @param {Array<Array>}  values  Matriz de filas × columnas
 */
export async function sheetsWrite(spreadsheetId, range, values) {
  const s = await client_();
  await s.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/**
 * Agregar filas al final de un rango (append).
 * @param {string} spreadsheetId
 * @param {string} range          Ej: "Hoja1!A:Z" (Sheets detecta la primera fila libre)
 * @param {Array<Array>}  values  Filas a agregar
 */
export async function sheetsAppend(spreadsheetId, range, values) {
  const s = await client_();
  await s.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

/**
 * Limpiar (borrar) un rango.
 * @param {string} spreadsheetId
 * @param {string} range
 */
export async function sheetsClear(spreadsheetId, range) {
  const s = await client_();
  await s.spreadsheets.values.clear({ spreadsheetId, range });
}

/**
 * Leer múltiples rangos en una sola llamada (batchGet).
 * @param {string}   spreadsheetId
 * @param {string[]} ranges        Ej: ["Hoja1!A:B", "Hoja2!C1:D50"]
 * @returns {Array<Array<Array>>}  Un array por cada rango solicitado
 */
export async function sheetsBatchRead(spreadsheetId, ranges) {
  const s = await client_();
  const res = await s.spreadsheets.values.batchGet({ spreadsheetId, ranges });
  return (res.data.valueRanges || []).map((vr) => vr.values || []);
}
