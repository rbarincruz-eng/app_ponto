const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors()); // Permite que o Front-end (Vercel) acesse o Back-end

// Configuração da conexão com o Banco de Dados (Supabase/PostgreSQL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- FUNÇÃO AUXILIAR: CÁLCULO DE DISTÂNCIA (HAVERSINE) ---
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
}

// --- ROTA 1: BUSCAR LOCAIS AUTORIZADOS DO USUÁRIO ---
app.get('/api/locais', async (req, res) => {
    const { usuario_id } = req.query;
    try {
        const result = await pool.query(`
            SELECT l.* FROM locais l
            JOIN usuario_locais ul ON l.id = ul.local_id
            WHERE ul.usuario_id = $1 AND l.ativo = TRUE`, [usuario_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar locais." });
    }
});

// --- ROTA 2: REGISTRAR PONTO (COM VALIDAÇÃO GPS) ---
app.post('/api/ponto/registrar', async (req, res) => {
    const { usuario_id, lat_atual, lon_atual, tipo } = req.body;

    try {
        // 1. Busca locais vinculados ao usuário
        const locais = await pool.query(`
            SELECT l.* FROM locais l
            JOIN usuario_locais ul ON l.id = ul.local_id
            WHERE ul.usuario_id = $1`, [usuario_id]);

        let localIdentificado = null;

        // 2. Valida se está em algum local
        for (const local of locais.rows) {
            const dist = calcularDistancia(lat_atual, lon_atual, local.latitude, local.longitude);
            if (dist <= local.raio_permitido) {
                localIdentificado = local;
                break;
            }
        }

        if (!localIdentificado) {
            return res.status(403).json({ erro: "Fora do perímetro autorizado." });
        }

        // 3. Salva o registro no banco
        if (tipo === 'ENTRADA') {
            await pool.query(`
                INSERT INTO registros_ponto (usuario_id, local_id, hora_entrada, lat_registro, lon_registro)
                VALUES ($1, $2, NOW(), $3, $4)`, [usuario_id, localIdentificado.id, lat_atual, lon_atual]);
        } else {
            await pool.query(`
                UPDATE registros_ponto SET hora_saida = NOW()
                WHERE usuario_id = $1 AND hora_saida IS NULL`, [usuario_id]);
        }

        res.json({ mensagem: `Ponto registrado em: ${localIdentificado.nome_local}` });

    } catch (err) {
        res.status(500).json({ erro: "Erro ao processar registro." });
    }
});

// --- ROTA 3: RECUPERAR SENHA ---
app.post('/api/auth/esqueci-senha', async (req, res) => {
    const { email } = req.body;
    // Lógica para gerar token e "enviar e-mail" (simulado no log)
    console.log(`Solicitação de senha para: ${email}`);
    res.json({ mensagem: "Se o e-mail existir, um link será enviado." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));