const { FLASH_COOKIE_NAME, FLASH_TTL_MS } = require('./constants');

function encodeFlashValue(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeFlashValue(rawValue) {
  try {
    const json = Buffer.from(rawValue, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch (err) {
    return null;
  }
}

function setFlashMessage(res, type, message) {
  if (!message) {
    return;
  }
  const payload = {
    type,
    message,
    createdAt: Date.now(),
  };
  res.cookie(FLASH_COOKIE_NAME, encodeFlashValue(payload), {
    maxAge: FLASH_TTL_MS,
    httpOnly: true,
    sameSite: 'lax',
  });
}

function consumeFlashMessage(req, res) {
  const raw = req.cookies?.[FLASH_COOKIE_NAME];
  if (!raw) {
    return null;
  }
  res.clearCookie(FLASH_COOKIE_NAME);
  const data = decodeFlashValue(raw);
  if (!data) {
    return null;
  }
  if (Date.now() - data.createdAt > FLASH_TTL_MS) {
    return null;
  }
  return data;
}

module.exports = {
  setFlashMessage,
  consumeFlashMessage,
};
