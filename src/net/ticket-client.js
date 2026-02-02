const { Long } = require('bson');
const { CarriageClient } = require('./carriage-client');

/**
 * Ticket server connection (V2SL encrypted).
 * Used for CHECKIN to get the Carriage server address.
 */
class TicketClient extends CarriageClient {
  /**
   * Send CHECKIN to get Carriage server address.
   */
  async checkin({ userId, os = 'android', appVer = '26.1.2', lang = 'ko', ntype = 0, useSub = false, mccmnc = '45005' }) {
    const body = {
      userId: Long.fromNumber(typeof userId === 'number' ? userId : parseInt(userId)),
      os,
      ntype,
      appVer,
      lang,
    };
    if (useSub) body.useSub = true;
    if (mccmnc) body.MCCMNC = mccmnc;

    const res = await this.request('CHECKIN', body);
    return {
      host: res.body.host || '',
      host6: res.body.host6 || '',
      port: res.body.port || 0,
      cacheExpire: res.body.cacheExpire || 0,
      status: res.status,
      raw: res.body,
    };
  }
}

module.exports = { TicketClient };
