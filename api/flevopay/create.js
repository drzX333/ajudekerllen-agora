// Vercel Serverless Function - Criar Transação PIX Flevo Pay
export default async function handler(req, res) {
  // Configura CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Método não permitido' });
  }

  try {
    const FLEVO_SECRET_KEY = process.env.FLEVO_SECRET_KEY || 'sk_fdc7594e7eb1486ea3e282cc0a8249b55f1e0270b6844a8f506060f75d529968';
    const body = req.body || {};

    const amount = body.amount ? parseInt(body.amount, 10) : 3000;
    const ref = body.reference || 'REF_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const desc = body.description || 'Doação Amor Vivo - Kerllen';

    const cust = body.customer || {};
    const name = cust.name || 'Doador Solidário';
    const email = cust.email || 'doador@amorvivo.online';
    const phone = cust.phone ? cust.phone.replace(/\D/g, '') : '11999998888';
    let doc = cust.document ? cust.document.replace(/\D/g, '') : '12345678901';
    if (!doc || doc.length < 11) doc = '12345678901';

    const payload = {
      amount: amount,
      description: desc,
      reference: ref,
      source: 'api_externa',
      customer: {
        name: name,
        email: email,
        phone: phone,
        document: doc
      }
    };

    const flevoResponse = await fetch('https://app.flevopay.com.br/api/v1/transaction', {
      method: 'POST',
      headers: {
        'X-API-Key': FLEVO_SECRET_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await flevoResponse.json();
    return res.status(flevoResponse.status).json(data);
  } catch (error) {
    console.error('Erro na API Flevo Pay (Vercel):', error);
    return res.status(500).json({ status: 'error', message: error.message || 'Erro ao processar transação' });
  }
}
