// 결제 완료 후 토큰 검증 엔드포인트
// 사이트가 ?token=xxx 로 돌아오면 이 API를 호출해서 언락 여부 확인

async function redisGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.query;

  if (!token || token.length < 10) {
    return res.status(400).json({ valid: false, error: 'Invalid token' });
  }

  try {
    const raw = await redisGet(`unlock:${token}`);

    if (!raw) {
      return res.status(404).json({ valid: false, error: 'Token not found or expired' });
    }

    const data = JSON.parse(raw);

    // 토큰 1회 사용 처리 — 검증 후 TTL을 7일로 연장 (재방문 허용)
    // 완전 삭제하면 재방문 시 언락 안 됨
    return res.status(200).json({
      valid: true,
      type: data.type,       // 'full' or 'section'
      orderId: data.orderId,
    });

  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ valid: false, error: 'Server error' });
  }
}
