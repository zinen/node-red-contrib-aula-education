'use strict'
const Webhead = require('webhead')
const fs = require('node:fs/promises')

class AulaClient {
  // This aula client is based on https://github.com/scaarup/aula
  #session = null
  #password = ''
  #profiles = {}
  #API_BASE_URL = 'https://www.aula.dk/api/v'
  #cookieStore = null
  authenticated = false
  constructor (username = '', password = '', cookieStore = null) {
    if (username === '' || typeof username !== 'string') throw new Error('Username must be a string')
    if (username === '' || typeof username !== 'string') throw new Error('Password must be a string')
    this.username = username
    this.#password = password
    this.apiVersion = 16
    if (cookieStore) {
      this.#session = Webhead({ jarFile: cookieStore })
      this.#cookieStore = cookieStore
    }
    if (!cookieStore || !this.#cookieStore) {
      this.#session = Webhead()
    }
  }

  async login () {
    this.authenticated = false
    await this.#session.get('https://login.aula.dk/auth/login.php?type=unilogin')
    const data = {
      selectedIdp: 'uni_idp'
    }
    await this.#session.submit('form', data)
    const userData = { username: this.username, password: this.#password, 'selected-aktoer': 'KONTAKT' }
    console.log('userData', userData)
    let redirects = 0
    let success = false
    while (success === false && redirects < 10) {
      const postData = {}
      if (this.#session.$('.form-error-message') && this.#session.$('.form-error-message').length) {
        throw new Error(String(this.#session.$('.form-error-message').html()).replace('<br>', '. '))
      }
      for (const input of this.#session.$('input')) {
        if ('name' in input.attribs && 'value' in input.attribs) {
          postData[input.attribs.name] = input.attribs.value
          for (const [key, value] of Object.entries(userData)) {
            if (input.attribs.name === key) {
              postData[key] = value
            }
          }
        }
      }
      await this.#session.submit('form', postData)
      if (String(this.#session.url) === 'https://www.aula.dk/portal/') {
        success = true
      }
      redirects += 1
    }
    if (!success) throw new Error(`Unilogin failed at url ${this.#session.url} after ${redirects} redirects`)
    this.authenticated = true
    await this.getProfile()
  }

  async clearSession () {
    try {
      await this.#session.clearCookies()
      if (this.#cookieStore) {
        await fs.unlink(this.#cookieStore).catch()
      }
    } catch (_) { }
  }

  async getProfile () {
    // Find the API url in case of a version change
    this.apiURL = this.#API_BASE_URL + String(this.apiVersion)
    let apiSuccess = false
    while (apiSuccess === false && this.apiVersion < 50) {
      await this.#session.get(this.apiURL + '?method=profiles.getProfilesByLogin')
      if (this.#session.response.statusCode === 410) {
        this.apiVersion += 1
      } else if (this.#session.response.statusCode === 403) {
        throw new Error('Access to Aula API was denied. Please check that you have entered the correct credentials.')
      } else if (this.#session.response.statusCode === 200) {
        const responseJson = JSON.parse(this.#session.response.data)
        this.#profiles = responseJson.data.profiles
        apiSuccess = true
      }
      this.apiURL = this.#API_BASE_URL + String(this.apiVersion)
    }
    if (!apiSuccess) throw new Error(`Aula API version not compatible. Tested up to API version ${this.apiVersion}.`)
  }

  async updateData () {
    this.newLogin = false
    if (!this.apiURL) {
      try {
        await this.getProfile()
        this.authenticated = true
      } catch (_) { }
    }
    if (this.authenticated !== true) {
      await this.login()
      this.newLogin = true
    }
    this.childIDs = []
    for (const profile of this.#profiles) {
      for (const child of profile.children) {
        this.childIDs.push(String(child.id))
      }
    }
    this.dailyOverview = {}
    const states = ['Ikke kommet', 'Syg', 'Ferie/Fri', 'Kommet/Til stede', 'På tur', 'Sover', '6', '7', 'Gået', '9', '10', '11', '12', '13', '14', '15']
    for (const childID of this.childIDs) {
      await this.#session.get(this.apiURL + '?method=presence.getDailyOverview&childIds[]=' + childID)
      const responseJson = JSON.parse(this.#session.response.data)
      if (responseJson.data && responseJson.data.length > 0) {
        this.dailyOverview[childID] = responseJson.data[0]
        this.dailyOverview[childID].state = states[this.dailyOverview[childID].status]
      } else {
        this.dailyOverview[childID] = { error: 'Unable to retrieve presence data from Aula' }
      }
    }
    this.updateDateTime = new Date().toISOString()
  }
}
module.exports = AulaClient
