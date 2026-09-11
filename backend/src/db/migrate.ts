import { readFileSync } from "fs";
import { join } from "path";
import { sqlite } from "./client";

/*
 * Las migraciones usan CREATE TABLE IF NOT EXISTS pero ALTER TABLE ADD COLUMN
 * no es idempotente en SQLite. Para evitar errores en reinicios, capturamos
 * "duplicate column" y continuamos — la migración ya se aplicó antes.
 */
function ejecutarMigracion(nombre: string, sql: string) {
  try {
    sqlite.exec(sql);
    console.log(`Migración ${nombre} aplicada.`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate column name")) {
      console.log(`Migración ${nombre} ya estaba aplicada (columna existe), continuando.`);
    } else {
      console.error(`Error en migración ${nombre}:`, msg);
      throw err;
    }
  }
}

const sqlInit = readFileSync(join(__dirname, "migrations", "0000_init.sql"), "utf-8");
ejecutarMigracion("0000_init", sqlInit);

const sqlMarketing = readFileSync(join(__dirname, "migrations", "0001_marketing.sql"), "utf-8");
ejecutarMigracion("0001_marketing", sqlMarketing);

const sqlOrg = readFileSync(join(__dirname, "migrations", "0002_org.sql"), "utf-8");
ejecutarMigracion("0002_org", sqlOrg);

const sqlProyectos = readFileSync(join(__dirname, "migrations", "0003_proyectos.sql"), "utf-8");
ejecutarMigracion("0003_proyectos", sqlProyectos);

const sqlBmf = readFileSync(join(__dirname, "migrations", "0004_bmf.sql"), "utf-8");
ejecutarMigracion("0004_bmf", sqlBmf);

const sqlMarketingV2 = readFileSync(join(__dirname, "migrations", "0005_marketing_v2.sql"), "utf-8");
ejecutarMigracion("0005_marketing_v2", sqlMarketingV2);

const sqlPipelineDepto = readFileSync(join(__dirname, "migrations", "0006_pipeline_depto.sql"), "utf-8");
ejecutarMigracion("0006_pipeline_depto", sqlPipelineDepto);

const sqlMultiDepto = readFileSync(join(__dirname, "migrations", "0007_multi_depto.sql"), "utf-8");
ejecutarMigracion("0007_multi_depto", sqlMultiDepto);

const sqlSeguridadPin = readFileSync(join(__dirname, "migrations", "0008_seguridad_pin.sql"), "utf-8");
ejecutarMigracion("0008_seguridad_pin", sqlSeguridadPin);

const sqlIngresos = readFileSync(join(__dirname, "migrations", "0009_ingresos.sql"), "utf-8");
ejecutarMigracion("0009_ingresos", sqlIngresos);

const sqlCumpleanos = readFileSync(join(__dirname, "migrations", "0010_cumpleanos.sql"), "utf-8");
ejecutarMigracion("0010_cumpleanos", sqlCumpleanos);

const sqlFinanzas = readFileSync(join(__dirname, "migrations", "0011_finanzas.sql"), "utf-8");
ejecutarMigracion("0011_finanzas", sqlFinanzas);

const sqlMetaAds = readFileSync(join(__dirname, "migrations", "0012_meta_ads.sql"), "utf-8");
ejecutarMigracion("0012_meta_ads", sqlMetaAds);

const sqlPodcastPerf = readFileSync(join(__dirname, "migrations", "0013_podcast_performance.sql"), "utf-8");
ejecutarMigracion("0013_podcast_performance", sqlPodcastPerf);

const sqlPermisosTareas = readFileSync(join(__dirname, "migrations", "0014_permisos_tareas.sql"), "utf-8");
ejecutarMigracion("0014_permisos_tareas", sqlPermisosTareas);

const sqlProyectosActivo = readFileSync(join(__dirname, "migrations", "0015_proyectos_activo.sql"), "utf-8");
ejecutarMigracion("0015_proyectos_activo", sqlProyectosActivo);

const sqlPodcastCitas = readFileSync(join(__dirname, "migrations", "0016_podcast_citas.sql"), "utf-8");
ejecutarMigracion("0016_podcast_citas", sqlPodcastCitas);

const sqlBmfDigital = readFileSync(join(__dirname, "migrations", "0017_bmf_digital.sql"), "utf-8");
ejecutarMigracion("0017_bmf_digital", sqlBmfDigital);

const sqlActivosDigitales = readFileSync(join(__dirname, "migrations", "0018_activos_digitales.sql"), "utf-8");
ejecutarMigracion("0018_activos_digitales", sqlActivosDigitales);

const sqlIdempotenciaPagos = readFileSync(join(__dirname, "migrations", "0019_idempotencia_pagos.sql"), "utf-8");
ejecutarMigracion("0019_idempotencia_pagos", sqlIdempotenciaPagos);

const sqlEliminarTeamLeader = readFileSync(join(__dirname, "migrations", "0020_eliminar_team_leader.sql"), "utf-8");
ejecutarMigracion("0020_eliminar_team_leader", sqlEliminarTeamLeader);

const sqlCumpleanos0021 = readFileSync(join(__dirname, "migrations", "0021_cumpleanos.sql"), "utf-8");
ejecutarMigracion("0021_cumpleanos", sqlCumpleanos0021);

const sqlMarketingCalendario = readFileSync(join(__dirname, "migrations", "0022_marketing_calendario.sql"), "utf-8");
ejecutarMigracion("0022_marketing_calendario", sqlMarketingCalendario);

const sqlMarketingCalendarioNota = readFileSync(join(__dirname, "migrations", "0023_marketing_calendario_nota.sql"), "utf-8");
ejecutarMigracion("0023_marketing_calendario_nota", sqlMarketingCalendarioNota);

const sqlTareasTiempos = readFileSync(join(__dirname, "migrations", "0024_tareas_tiempos.sql"), "utf-8");
ejecutarMigracion("0024_tareas_tiempos", sqlTareasTiempos);

const sqlCalendarioTipoTitulo = readFileSync(join(__dirname, "migrations", "0025_calendario_tipo_titulo.sql"), "utf-8");
ejecutarMigracion("0025_calendario_tipo_titulo", sqlCalendarioTipoTitulo);

const sqlEstadoCompletadaUnico = readFileSync(join(__dirname, "migrations", "0026_estado_completada_unico.sql"), "utf-8");
ejecutarMigracion("0026_estado_completada_unico", sqlEstadoCompletadaUnico);

const sqlTickets = readFileSync(join(__dirname, "migrations", "0027_tickets.sql"), "utf-8");
ejecutarMigracion("0027_tickets", sqlTickets);

const sqlTicketsEstado = readFileSync(join(__dirname, "migrations", "0028_tickets_estado.sql"), "utf-8");
ejecutarMigracion("0028_tickets_estado", sqlTicketsEstado);

const sqlRrhhEmpleados = readFileSync(join(__dirname, "migrations", "0029_rrhh_empleados.sql"), "utf-8");
ejecutarMigracion("0029_rrhh_empleados", sqlRrhhEmpleados);

const sqlRrhhAsistencia = readFileSync(join(__dirname, "migrations", "0030_rrhh_asistencia.sql"), "utf-8");
ejecutarMigracion("0030_rrhh_asistencia", sqlRrhhAsistencia);

const sqlRrhhSueldos = readFileSync(join(__dirname, "migrations", "0031_rrhh_sueldos.sql"), "utf-8");
ejecutarMigracion("0031_rrhh_sueldos", sqlRrhhSueldos);

const sqlRrhhCheckinsReposicion = readFileSync(join(__dirname, "migrations", "0032_rrhh_checkins_reposicion.sql"), "utf-8");
ejecutarMigracion("0032_rrhh_checkins_reposicion", sqlRrhhCheckinsReposicion);

// Modalidad de pago: una columna por archivo a propósito — ver la nota en 0033_modalidad_pago.sql.
const sqlModalidadPago = readFileSync(join(__dirname, "migrations", "0033_modalidad_pago.sql"), "utf-8");
ejecutarMigracion("0033_modalidad_pago", sqlModalidadPago);

const sqlMontoRecurrente = readFileSync(join(__dirname, "migrations", "0034_monto_recurrente.sql"), "utf-8");
ejecutarMigracion("0034_monto_recurrente", sqlMontoRecurrente);

const sqlFrecuenciaRecurrente = readFileSync(join(__dirname, "migrations", "0035_frecuencia_recurrente.sql"), "utf-8");
ejecutarMigracion("0035_frecuencia_recurrente", sqlFrecuenciaRecurrente);

// Hora de envío del Cierre diario de Podcast: la necesita el historial de reportes.
const sqlPodcastEnviadoEn = readFileSync(join(__dirname, "migrations", "0036_podcast_reporte_enviado_en.sql"), "utf-8");
ejecutarMigracion("0036_podcast_reporte_enviado_en", sqlPodcastEnviadoEn);

// Prospección por canal del Cierre diario (1:N del reporte). Solo crea una tabla nueva:
// las columnas viejas del reporte quedan intactas para los reportes históricos.
const sqlPodcastCanales = readFileSync(join(__dirname, "migrations", "0037_podcast_reporte_canales.sql"), "utf-8");
ejecutarMigracion("0037_podcast_reporte_canales", sqlPodcastCanales);

// Sello de las métricas automáticas al enviar el Cierre diario: evita que un reporte histórico
// cambie solo cuando alguien corrige el CRM semanas después.
const sqlPodcastSnapshot = readFileSync(join(__dirname, "migrations", "0038_podcast_reporte_snapshot.sql"), "utf-8");
ejecutarMigracion("0038_podcast_reporte_snapshot", sqlPodcastSnapshot);

// Índices de las consultas de métricas (por persona y por rango de fechas). Aditivos.
const sqlPodcastIndices = readFileSync(join(__dirname, "migrations", "0039_podcast_indices_metricas.sql"), "utf-8");
ejecutarMigracion("0039_podcast_indices_metricas", sqlPodcastIndices);
