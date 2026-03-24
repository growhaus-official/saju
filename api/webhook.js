import crypto from 'crypto';

// Upstash Redis REST API 헬퍼
async function redisSet(key, value, exSeconds) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const body = exSeconds
    ? ['SET', key, value, 'EX', exSeconds]
    : ['SET', key, value];
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([body]),
  });
  return res.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 서명 검증 ──
  const secret = process.env.LEMON_WEBHOOK_SECRET;
  const signature = req.headers['x-signature'];
  const rawBody = JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  if (hmac !== signature) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-event-name'];
  const data = req.body.data;

  // ── 결제 완료 ──
  if (event === 'order_created') {
    const orderId   = String(data.id);
    const email     = data.attributes.user_email;
    const productId = String(data.attributes.first_order_item?.product_id);
    const status    = data.attributes.status;

    if (status !== 'paid') {
      return res.status(200).json({ received: true });
    }

    const isFullProduct = productId === String(process.env.LS_FULL_PRODUCT_ID);
    const unlockType = isFullProduct ? 'full' : 'section';

    // 언락 토큰 생성 (orderId 기반 SHA256)
    const token = crypto
      .createHash('sha256')
      .update(`${orderId}:${secret}`)
      .digest('hex')
      .slice(0, 32);

    // Redis에 저장 — 24시간 TTL
    // key: token → value: JSON(unlockType, orderId, email)
    await redisSet(
      `unlock:${token}`,
      JSON.stringify({ type: unlockType, orderId, email }),
      86400 // 24시간
    );

    console.log(`✓ Stored unlock token for order ${orderId} | type: ${unlockType}`);
  }

  // ── 환불 ──
  if (event === 'order_refunded') {
    console.log(`Refund: order ${data.id}`);
    // 토큰 무효화는 TTL 만료로 자동 처리
  }

  return res.status(200).json({ received: true });
}
