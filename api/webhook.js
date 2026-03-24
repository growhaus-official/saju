const crypto = require('crypto');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. 서명 검증 ──
  const secret = process.env.LEMON_WEBHOOK_SECRET;
  const signature = req.headers['x-signature'];
  const rawBody = JSON.stringify(req.body);

  const hmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (hmac !== signature) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // ── 2. 이벤트 처리 ──
  const event = req.headers['x-event-name'];
  const data = req.body.data;

  if (event === 'order_created') {
    const orderId    = data.id;
    const email      = data.attributes.user_email;
    const productId  = data.attributes.first_order_item?.product_id;
    const status     = data.attributes.status; // 'paid'

    if (status === 'paid') {
      // 어떤 상품인지 확인
      const FULL_PRODUCT_ID    = process.env.LS_FULL_PRODUCT_ID;    // $4.99
      const SECTION_PRODUCT_ID = process.env.LS_SECTION_PRODUCT_ID; // $1.99

      let unlockType = 'full';
      if (String(productId) === String(SECTION_PRODUCT_ID)) {
        unlockType = 'section';
      }

      // 언락 토큰 생성 (이메일 + orderId 기반)
      const token = crypto
        .createHash('sha256')
        .update(`${email}:${orderId}:${secret}`)
        .digest('hex')
        .slice(0, 32);

      // 리다이렉트 URL에 토큰 포함
      // 실제로는 DB에 저장해야 하지만 MVP에서는 토큰 검증으로 충분
      console.log(`✓ Order ${orderId} | ${email} | type: ${unlockType} | token: ${token}`);

      // TODO: DB 저장 (Vercel KV 또는 Supabase)
      // 지금은 토큰을 이메일로 전송하거나 리다이렉트 URL에 포함
    }
  }

  if (event === 'order_refunded') {
    const orderId = data.id;
    const email   = data.attributes.user_email;
    console.log(`Refund processed: ${orderId} | ${email}`);
    // TODO: 언락 취소 처리
  }

  return res.status(200).json({ received: true });
}
