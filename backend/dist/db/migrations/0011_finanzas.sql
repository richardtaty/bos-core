-- Modelo financiero del deal: separa "saldo total pendiente" de "próximo pago".
-- Solo se guardan estos 3 campos; cobrado/saldo/vencido se calculan siempre.
ALTER TABLE registros ADD COLUMN proximo_pago REAL;
ALTER TABLE registros ADD COLUMN fecha_proximo_pago INTEGER;
ALTER TABLE registros ADD COLUMN metodo_pago TEXT;
