import crypto from 'crypto';

async function redisSet(key, value, exSeconds) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['SET', key, value, 'EX', exSeconds]]),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.LEMON_WEBHOOK_SECRET;
  const sig = req.headers['x-signature'];
  const hmac = crypto.createHmac('sha256', secret)
    .update(JSON.stringify(req.body)).digest('hex');
  if (hmac !== sig) return res.status(401).json({ error: 'Invalid signature' });

  const event = req.headers['x-event-name'];
  const data = req.body.data;

  if (event === 'order_created' && data.attributes.status === 'paid') {
    const orderId   = String(data.id);
    const email     = data.attributes.user_email.toLowerCase().trim();
    const productId = String(data.attributes.first_order_item?.product_id);
    const type      = productId === String(process.env.LS_FULL_PRODUCT_ID) ? 'full' : 'section';

    // custom session_id (결제 전 프론트에서 생성해서 넘긴 값)
    const sessionId = data.attributes.first_order_item?.custom_data?.session_id;

    // 세션 ID 기반으로 저장 — 프론트에서 폴링으로 확인
    if (sessionId) {
      await redisSet(
        `session:${sessionId}`,
        JSON.stringify({ type, orderId, email, paid: true }),
        3600 // 1시간
      );
    }

    // 이메일 기반도 함께 저장 (백업)
    await redisSet(
      `email:${email}`,
      JSON.stringify({ type, orderId, paid: true }),
      604800 // 7일
    );

    console.log(`✓ Order ${orderId} | ${email} | ${type} | session: ${sessionId}`);
  }

  return res.status(200).json({ received: true });
}
