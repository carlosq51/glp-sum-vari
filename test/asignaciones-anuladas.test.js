import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

// Una asignación con `activo=false` es trabajo que NO ocurrió: se le quitó el
// carro a alguien, o lo cerró por error. La regla es una sola —quien cuenta
// trabajo tiene que respetarla— pero vivía repartida en consultas sueltas, y
// tres de ellas se la saltaban: el ranking semanal del técnico, el crédito del
// día del motor y los datos con los que se entrena el modelo de parejas.
//
// El síntoma era feo de diagnosticar: al quitarle un carro a un técnico
// desaparecía de los reportes del supervisor —que sí filtran— y seguía sumando
// en los otros tres, donde nadie lo iba a buscar. Dos pantallas de la misma app
// daban números distintos del mismo día.
//
// Este test no prueba comportamiento: lee el código y exige que toda consulta
// de asignaciones que filtre por FINALIZADO filtre también por activo. Es un
// candado barato para una regla que no tiene dónde vivir sola, porque cada
// consulta se arma a mano contra PostgREST.

const RUTAS = resolve(process.cwd(), "routes");
const archivos = readdirSync(RUTAS).filter((f) => f.endsWith(".js"));

/** Trozo de código alrededor de una posición, para que el fallo diga dónde. */
function contexto(src, pos, radio = 220) {
  return src.slice(Math.max(0, pos - radio), pos + radio);
}

/**
 * ¿La coincidencia está dentro de un comentario?
 *
 * Los ejemplos de las cabeceras citan querystrings completas, y hacerlas fallar
 * convertiría este candado en un test que se salta con un `//`: el que viniera
 * detrás aprendería a comentar la consulta en vez de arreglarla.
 */
function enComentario(src, pos) {
  const linea = src.slice(src.lastIndexOf("\n", pos) + 1, pos);
  return /^\s*(\/\/|\*|\/\*)/.test(linea);
}

describe("consultas de asignaciones · las anuladas no cuentan", () => {
  for (const archivo of archivos) {
    const src = readFileSync(resolve(RUTAS, archivo), "utf8");

    it(`${archivo}: todo FINALIZADO va con activo=eq.true`, () => {
      const faltan = [];
      const re = /estado_actual=eq\.FINALIZADO/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        if (enComentario(src, m.index)) continue;
        const trozo = contexto(src, m.index);
        // La consulta se parte en varios template strings concatenados, así que
        // se mira la vecindad y no la línea: `activo=eq.true` puede ir dos
        // líneas más arriba o más abajo dentro de la misma URL.
        if (!trozo.includes("activo=eq.true")) faltan.push(trozo.trim());
      }
      expect(faltan, `sin activo=eq.true en ${archivo}:\n\n${faltan.join("\n---\n")}`)
        .toEqual([]);
    });
  }
});
