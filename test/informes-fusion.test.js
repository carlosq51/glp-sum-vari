// =========================
// test/informes-fusion.test.js
// El informe lo llenan DOS personas: el delantero (MOTOR) y el tanquero
// (TANQUE), cada uno su mitad, al acabar el trabajo.
//
// Lo que se vigila aquí es que nadie pise a nadie. Si el segundo en enviar
// borrara lo del primero, el papel saldría a medias y NO habría forma de
// notarlo hasta tenerlo impreso en la mano — que es exactamente el tipo de
// fallo que este módulo existe para evitar.
// =========================

import { describe, it, expect } from "vitest";
import { fusionarInforme_, aplanarInforme_, informeVacio_ } from "../lib/informes.js";

const parteMotor = {
  nombre: "FRANZ COSTILLA",
  inicio: "2026-09-21T08:00:00Z",
  fin: "2026-09-21T12:30:00Z",
  comun: { placa: "ABC-123" },
  tareas: [0, 1],
  marcados: [0, 1, 2],
  bateria: { v: "12.4", ai: "0.02", af: "13.9" },
  cilindros: ["180", "182", "179", "181"],
  observaciones: "Refractometro",
  etapas: { compresion: true, mecanica: true },
};

const parteTanque = {
  nombre: "HENRY LUZA",
  inicio: "2026-09-21T09:15:00Z",
  fin: null,
  tareas: [4],
  marcados: [20, 21, 22],
  observaciones: "Falta abrazadera",
  etapas: { tanque: true },
};

describe("Fusión de las dos mitades", () => {
  it("el segundo en enviar NO borra lo del primero", () => {
    let d = fusionarInforme_(null, "MOTOR", parteMotor);
    d = fusionarInforme_(d, "TANQUE", parteTanque);

    expect(d.porRol.MOTOR.nombre).toBe("FRANZ COSTILLA");
    expect(d.porRol.TANQUE.nombre).toBe("HENRY LUZA");
    expect(d.porRol.MOTOR.cilindros).toEqual(["180", "182", "179", "181"]);
  });

  it("da igual quién envíe primero", () => {
    const a = fusionarInforme_(fusionarInforme_(null, "MOTOR", parteMotor), "TANQUE", parteTanque);
    const b = fusionarInforme_(fusionarInforme_(null, "TANQUE", parteTanque), "MOTOR", parteMotor);
    expect(aplanarInforme_(a).marcados).toEqual(aplanarInforme_(b).marcados);
    expect(aplanarInforme_(a).tecnicos).toEqual(aplanarInforme_(b).tecnicos);
  });

  it("reenviar la misma mitad la reemplaza, no la duplica", () => {
    let d = fusionarInforme_(null, "MOTOR", parteMotor);
    d = fusionarInforme_(d, "MOTOR", { ...parteMotor, observaciones: "Corregido" });
    expect(d.porRol.MOTOR.observaciones).toBe("Corregido");
    expect(Object.keys(d.porRol)).toEqual(["MOTOR"]);
  });

  it("un rol que no existe no toca nada", () => {
    const d = fusionarInforme_(null, "RAMALERO", parteMotor);
    expect(d.porRol).toEqual({});
  });
});

describe("Lo común lo puede poner cualquiera de los dos", () => {
  it("el tanquero no borra la placa que puso el delantero", () => {
    // Manda su mitad sin placa porque ya estaba puesta. Si el campo vacío
    // sobrescribiera, el papel saldría sin placa y no serviría.
    let d = fusionarInforme_(null, "MOTOR", parteMotor);
    d = fusionarInforme_(d, "TANQUE", parteTanque);
    expect(d.comun.placa).toBe("ABC-123");
  });

  it("si el primero no la puso, el segundo sí puede", () => {
    let d = fusionarInforme_(null, "MOTOR", { ...parteMotor, comun: {} });
    d = fusionarInforme_(d, "TANQUE", { ...parteTanque, comun: { placa: "XYZ-789" } });
    expect(d.comun.placa).toBe("XYZ-789");
  });

  it("marca y modelo traen su valor de siempre", () => {
    const d = informeVacio_();
    expect(d.comun.marca).toBe("JETOUR");
    expect(d.comun.modelo).toBe("X70");
  });
});

describe("Aplanado: lo que acaba en las tres hojas", () => {
  const plano = () => aplanarInforme_(
    fusionarInforme_(fusionarInforme_(null, "MOTOR", parteMotor), "TANQUE", parteTanque)
  );

  it("une los puntos marcados por los dos, sin repetir", () => {
    expect(plano().marcados).toEqual([0, 1, 2, 20, 21, 22]);
  });

  it("une las tareas del detalle", () => {
    expect(plano().tareas).toEqual([0, 1, 4]);
  });

  it("conserva las observaciones de AMBOS", () => {
    // Quedarse solo con una perdería la única razón por la que el campo existe.
    const obs = plano().observaciones;
    expect(obs).toContain("Refractometro");
    expect(obs).toContain("Falta abrazadera");
  });

  it("el delantero va primero en la línea de técnicos", () => {
    expect(plano().tecnicos).toEqual(["FRANZ COSTILLA", "HENRY LUZA"]);
    expect(plano().tanquero).toBe("HENRY LUZA");
  });

  it("cada uno lleva sus propias horas al registro de producción", () => {
    const prod = plano().prod;
    expect(prod).toHaveLength(2);
    expect(prod[0].inicio).toBe("2026-09-21T08:00:00Z");
    expect(prod[1].inicio).toBe("2026-09-21T09:15:00Z");
    // El tanquero sigue abierto: su fin va vacío y lo pone la impresión.
    expect(prod[1].fin).toBe("");
  });

  it("dice qué mitad falta, para no imprimir un papel incompleto", () => {
    expect(aplanarInforme_(fusionarInforme_(null, "MOTOR", parteMotor)).faltan).toEqual(["TANQUE"]);
    expect(plano().faltan).toEqual([]);
  });

  it("si solo mandó el tanquero, sus medidas no se pierden", () => {
    const d = fusionarInforme_(null, "TANQUE", { ...parteTanque, cilindros: ["1", "2", "3", "4"] });
    expect(aplanarInforme_(d).cilindros).toEqual(["1", "2", "3", "4"]);
  });
});

describe("Informes con la forma vieja", () => {
  it("no se rompe con los guardados antes de ser colaborativo", () => {
    // Los primeros informes eran un objeto plano. Si al abrirlos petara,
    // la oficina no podría imprimir papeles ya enviados.
    const viejo = { placa: "OLD-111", ot: "999", vin: "VIN123", tareas: [0] };
    const d = fusionarInforme_(viejo, "TANQUE", parteTanque);
    expect(d.comun.placa).toBe("OLD-111");
    expect(d.comun.ot).toBe("999");
    expect(d.porRol.TANQUE.nombre).toBe("HENRY LUZA");
  });

  it("aplanar uno vacío devuelve algo usable, no revienta", () => {
    const p = aplanarInforme_(null);
    expect(p.tecnicos).toEqual([]);
    expect(p.marcados).toEqual([]);
    expect(p.faltan).toEqual(["MOTOR", "TANQUE"]);
  });
});

describe("El campo OT del papel es la orden FÍSICA, no el UUID", () => {
  // La hoja lleva "OT : ____". Poner ahí el work_order_id del sistema
  // —un UUID de 36 caracteres— daba un papel inservible: nadie puede
  // cruzarlo con la orden de trabajo que el taller maneja en mano.
  it("guarda el número que escribe el técnico", () => {
    const d = fusionarInforme_(null, "MOTOR", { ...parteMotor, comun: { ot: "9801" } });
    expect(d.comun.ot).toBe("9801");
    expect(aplanarInforme_(d).ot).toBe("9801");
  });

  it("el compañero no la borra al mandar su mitad sin ella", () => {
    let d = fusionarInforme_(null, "MOTOR", { ...parteMotor, comun: { ot: "9801" } });
    d = fusionarInforme_(d, "TANQUE", parteTanque);
    expect(d.comun.ot).toBe("9801");
  });

  it("si el primero la olvidó, el segundo puede ponerla", () => {
    let d = fusionarInforme_(null, "MOTOR", { ...parteMotor, comun: {} });
    d = fusionarInforme_(d, "TANQUE", { ...parteTanque, comun: { ot: "9802" } });
    expect(d.comun.ot).toBe("9802");
  });
});

describe("La línea PLACA del papel lleva el VIN completo", () => {
  // Los carros que se convierten son nuevos y todavía no tienen matrícula,
  // así que el taller los identifica por el VIN. La etiqueta del papel no
  // cambia —es el formulario que la empresa firma—, solo el dato.
  it("sin placa, imprime el VIN en su lugar", () => {
    const d = fusionarInforme_(null, "MOTOR", {
      ...parteMotor, comun: { ot: "9801", vin: "LVTDB11B1VH513573" },
    });
    const p = aplanarInforme_(d);
    expect(p.placa).toBe("LVTDB11B1VH513573");
    expect(p.ot).toBe("9801");          // la OT sigue en su propia línea
  });

  it("el VIN va COMPLETO, sin recortar", () => {
    const d = fusionarInforme_(null, "MOTOR", { ...parteMotor, comun: { vin: "LVTDB11B1VH513573" } });
    expect(aplanarInforme_(d).placa).toHaveLength(17);
  });

  it("una placa de verdad escrita desde la oficina manda sobre el VIN", () => {
    const d = fusionarInforme_(null, "MOTOR", {
      ...parteMotor, comun: { vin: "LVTDB11B1VH513573", placa: "ABC-123" },
    });
    expect(aplanarInforme_(d).placa).toBe("ABC-123");
  });

  it("sin VIN ni placa la línea queda vacía, no dice 'undefined'", () => {
    const d = fusionarInforme_(null, "MOTOR", { ...parteMotor, comun: {} });
    expect(aplanarInforme_(d).placa).toBe("");
  });
});
