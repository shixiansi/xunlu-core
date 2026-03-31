import rkeyService, {
  DEFAULT_SERVER_URL,
  getRkeyBundle,
  getRkeySnapshot,
  refreshRkeyBundle,
} from "../../../utils/rkey.js"

class RkeyManager {
  constructor(serverUrl = DEFAULT_SERVER_URL) {
    this.serverUrl = serverUrl
  }

  get rkeyData() {
    return getRkeySnapshot()
  }

  async getRkey() {
    return await getRkeyBundle()
  }

  isExpired() {
    return rkeyService.isExpired()
  }

  async refreshRkey() {
    return await refreshRkeyBundle()
  }

  async fetchServerRkey() {
    return await rkeyService.fetchServerRkey()
  }
}

export default new RkeyManager()
