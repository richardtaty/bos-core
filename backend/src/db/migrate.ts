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
