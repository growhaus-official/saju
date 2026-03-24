// 결제 완료 확인 — 프론트에서 폴링으로 호출
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
  if (req.method !== 'GET') return res.status(405).end();

  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ paid: false });

  try {
    const raw = await redisGet(`session:${session_id}`);
    if (!raw) return res.status(200).json({ paid: false });

    const data = JSON.parse(raw);
    return res.status(200).json({ paid: true, type: data.type });
  } catch (e) {
    return res.status(500).json({ paid: false });
  }
}
