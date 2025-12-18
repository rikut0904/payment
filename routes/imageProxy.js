var express = require('express');
var { Readable } = require('stream');

var router = express.Router();

var fetchImpl = globalThis.fetch;
if (!fetchImpl) {
  try {
    fetchImpl = require('node-fetch');
  } catch (err) {
    throw new Error('fetch API is not available in this runtime environment.');
  }
}
var fetch = (url, options) => fetchImpl(url, options);

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function normalizeUrl(target) {
  if (!target) return null;
  try {
    const parsed = new URL(target);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch (err) {
    return null;
  }
}

router.get(
  '/',
  asyncHandler(async function (req, res) {
    const normalizedUrl = normalizeUrl(req.query.url);
    if (!normalizedUrl) {
      return res.status(400).send('有効な画像URLを指定してください。');
    }
    const response = await fetch(normalizedUrl);
    if (!response.ok || !response.body) {
      return res.status(response.status || 502).send('画像の取得に失敗しました。');
    }
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    const cacheHeader = response.headers.get('cache-control');
    if (cacheHeader) {
      res.setHeader('Cache-Control', cacheHeader);
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300');
    }
    if (Readable.fromWeb && typeof response.body.getReader === 'function') {
      const nodeStream = Readable.fromWeb(response.body);
      nodeStream.on('error', (err) => {
        nodeStream.destroy();
        res.destroy(err);
      });
      nodeStream.pipe(res);
      return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  })
);

module.exports = router;
