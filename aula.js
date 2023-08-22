"use strict";
const Webhead = require('webhead')
class AulaClient {
  // This aula client is based on https://github.com/scaarup/aula
  #session = null
  #password = ''
  #profiles = {}
  #API_BASE_URL = "https://www.aula.dk/api/v"
  constructor(username = "", password = "") {
    this.username = username
    this.#password = password
    this.apiVersion = 16
  }
  async login() {
    this.#session = Webhead()
    await this.#session.get('https://login.aula.dk/auth/login.php?type=unilogin')
    let data = {
      'selectedIdp': 'uni_idp',
    }
    await this.#session.submit('form', data);

    let user_data = { 'username': this.username, 'password': this.#password, 'selected-aktoer': "KONTAKT" }
    let redirects = 0
    let success = false

    while (success == false && redirects < 10) {
      const post_data = {}
      for (const input of this.#session.$('input')) {
        if ('name' in input.attribs && 'value' in input.attribs) {
          post_data[input.attribs.name] = input.attribs.value
          for (let [key, value] of Object.entries(user_data)) {
            if (input.attribs.name == key) {
              post_data[key] = value
            }
          }
        }
      }
      await this.#session.submit('form', post_data);

      if (this.#session.url == 'https://www.aula.dk/portal/') {
        success = true
      }
      redirects += 1
    }
    if (!success) throw new Error('Uni login failed')
    await this.getProfile()
  }

  async getProfile() {
    // Find the API url in case of a version change
    this.apiURL = this.#API_BASE_URL + String(this.apiVersion)
    let apiSuccess = false
    while (apiSuccess == false && this.apiVersion < 50) {
      await this.#session.get(this.apiURL + "?method=profiles.getProfilesByLogin")
      if (this.#session.response.statusCode == 410) {
        this.apiVersion += 1
      } else if (this.#session.response.statusCode == 403) {
        throw new Error("Access to Aula API was denied. Please check that you have entered the correct credentials.")
      } else if (this.#session.response.statusCode == 200) {
        let responseJson = JSON.parse(this.#session.response.data)
        this.#profiles = responseJson.data.profiles
        apiSuccess = true
      }
      this.apiURL = this.#API_BASE_URL + String(this.apiVersion)
    }
    if (!apiSuccess) throw new Error(`Aula API version not compatible. Tested up to API version ${this.apiVersion}.`)
  }

  async updateData() {
    let isLoggedIn = false
    if (this.#session) {
      await this.#session.get(this.apiURL + "?method=profiles.getProfilesByLogin")
      isLoggedIn = JSON.parse(this.#session.response.data).status.message == "OK"
    }
    if (!isLoggedIn) {
      await this.login()
    }

    this.childIDs = []
    for (const profile of this.#profiles) {
      for (const child of profile["children"]) {
        this.childIDs.push(String(child["id"]))
      }
    }
    this.dailyOverview = {}
    const states = ["Ikke kommet", "Syg", "Ferie/Fri", "Kommet/Til stede", "På tur", "Sover", "6", "7", "Gået", "9", "10", "11", "12", "13", "14", "15"]
    for (const childID of this.childIDs) {
      await this.#session.get(this.apiURL + "?method=presence.getDailyOverview&childIds[]=" + childID)
      let responseJson = JSON.parse(this.#session.response.data)
      if (responseJson["data"].length > 0) {
        this.dailyOverview[childID] = responseJson["data"][0]
        this.dailyOverview[childID].state = states[this.dailyOverview[childID].status]
      } else {
        this.dailyOverview[childID] = { error: "Unable to retrieve presence data from Aula" }
      }
    }
    this.updateDateTime = new Date().toISOString()
  }
}

module.exports = function (RED) {
  'use strict'
  function AulaNode(config) {
    RED.nodes.createNode(this, config)
    const node = this
    try {
      node.aulaClient = new AulaClient(node.credentials.username, node.credentials.password)
    } catch (error) {
      node.error('nibe config error: ' + error.message || error)
    }
    node.on('input', async function (msg, send, done) {
      try {
        node.status({ fill: '', text: 'Requesting data' })
        await node.aulaClient.updateData()
        msg.payload = JSON.parse(JSON.stringify(node.aulaClient))
        node.status({ fill: '', text: '' })
        send(msg)
        done()
      } catch (error) {
        node.status({ fill: 'red', text: error.message || error })
        done(error.message || error)
      }
    })
  }
  RED.nodes.registerType('aulaNode', AulaNode, {
    credentials: {
      username: { type: "text" },
      password: { type: "password" }
    }
  })
}
