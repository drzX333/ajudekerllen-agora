// Vercel Serverless Function - Consultar Status de Transação Flevo Pay
export default async function handler(req, res) {
  // Configura CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'error', message: 'Método não permitido' });
  }

  const id = req.query.id;
  if (!id) {
    return res.status(400).json({ status: 'error', message: 'ID da transação ausente' });
  }

  try {
    const FLEVO_SECRET_KEY = process.env.FLEVO_SECRET_KEY || 'sk_fdc7594e7eb1486ea3e282cc0a8249b55f1e0270b6844a8f506060f75d529968';

    const flevoResponse = await fetch(`https://app.flevopay.com.br/api/v1/query?action=get_transaction&id=${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        'X-API-Key': FLEVO_SECRET_KEY
      }
    });

    const data = await flevoResponse.json();
    return res.status(flevoResponse.status).json(data);
  } catch (error) {
    console.error('Erro na consulta Flevo Pay (Vercel):', error);
    return res.status(500).json({ status: 'error', message: error.message || 'Erro ao consultar status da transação' });
  }
}
