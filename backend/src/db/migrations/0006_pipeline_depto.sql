-- 0006_pipeline_depto: vincula cada pipeline a su unidad de negocio.
-- Un pipeline sin departamento_id es visible solo para SUPER_ADMIN.

ALTER TABLE pipelines ADD COLUMN departamento_id TEXT REFERENCES departamentos(id);

-- Sala de OFERTAS (Ventas) — Edith
UPDATE pipelines SET departamento_id = (SELECT id FROM departamentos WHERE nombre = 'Sala de OFERTAS' LIMIT 1)
WHERE nombre IN ('Ventas', 'Eventos', 'Speakers', 'Mentorías', 'Código Financiero', 'Kappitalia');

-- Préstamos (Business Market Finders) — Oriany
UPDATE pipelines SET departamento_id = (SELECT id FROM departamentos WHERE nombre = 'Business Market Finders' LIMIT 1)
WHERE nombre IN ('BMF Financiero', 'Partners');

-- Podcast — Richard (temporal)
UPDATE pipelines SET departamento_id = (SELECT id FROM departamentos WHERE nombre = 'Podcast' LIMIT 1)
WHERE nombre = 'Podcast';

-- Los demás (Contenido, Customer Success, Afiliados, Clientes, Onboarding)
-- quedan sin departamento → solo SUPER_ADMIN.
