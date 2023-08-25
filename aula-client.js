'use strict'
const Webhead = require('webhead')
const fs = require('node:fs/promises')

class AulaClient {
  // This aula client is based on https://github.com/scaarup/aula
  #session = null

  #internals = {
    API_BASE_URL: 'https://www.aula.dk/api/v',
    password: '',
    profiles: {},
    cookieStore: null
  }

  options = { apiVersion: 16, authenticated: false }
  constructor ({ username, password, cookieStore = null, updateDailyOverview = true, updateMessage = false, updateCalendar = false }) {
    if (!username || typeof username !== 'string') throw new Error('Username must be a string')
    if (!username || typeof username !== 'string') throw new Error('Password must be a string')
    this.options.username = username
    this.#internals.password = password
    this.options.updateDailyOverview = updateDailyOverview
    this.options.updateMessage = updateMessage
    this.options.updateCalendar = updateCalendar
    if (cookieStore) {
      try {
        this.#session = Webhead({ jarFile: cookieStore })
        this.#internals.cookieStore = cookieStore
      } catch (_) { }
    }
    if (!cookieStore || !this.#internals.cookieStore) {
      this.#session = Webhead()
    }
  }

  async login () {
    this.options.authenticated = false
    await this.#session.get('https://login.aula.dk/auth/login.php?type=unilogin')
    const data = {
      selectedIdp: 'uni_idp'
    }
    await this.#session.submit('form', data)
    const userData = { username: this.options.username, password: this.#internals.password, 'selected-aktoer': 'KONTAKT' }
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
    this.options.authenticated = true
    await this.getProfile()
  }

  async clearSession () {
    try {
      await this.#session.clearCookies()
      if (this.#internals.cookieStore) {
        await fs.unlink(this.#internals.cookieStore).catch()
      }
    } catch (_) { }
  }

  async getProfile () {
    // Find the API url in case of a version change
    this.options.apiURL = this.#internals.API_BASE_URL + String(this.options.apiVersion)
    let apiSuccess = false
    while (apiSuccess === false && this.options.apiVersion < 50) {
      await this.#session.get(this.options.apiURL + '?method=profiles.getProfilesByLogin')
      if (this.#session.response.statusCode === 410) {
        this.options.apiVersion += 1
      } else if (this.#session.response.statusCode === 403) {
        throw new Error('Access to Aula API was denied. Please check that you have entered the correct credentials.')
      } else if (this.#session.response.statusCode === 200) {
        const responseJson = JSON.parse(this.#session.response.data)
        this.#internals.profiles = responseJson.data.profiles
        apiSuccess = true
      }
      this.options.apiURL = this.#internals.API_BASE_URL + String(this.options.apiVersion)
    }
    if (!apiSuccess) throw new Error(`Aula API version not compatible. Tested up to API version ${this.options.apiVersion}.`)
  }

  async getDailyOverview () {
    this.#internals.childIDs = []
    for (const profile of this.#internals.profiles) {
      for (const child of profile.children) {
        this.#internals.childIDs.push(String(child.id))
      }
    }
    this.dailyOverview = {}
    const states = ['Ikke kommet', 'Syg', 'Ferie/Fri', 'Kommet/Til stede', 'På tur', 'Sover', '6', '7', 'Gået', '9', '10', '11', '12', '13', '14', '15']
    for (const childID of this.#internals.childIDs) {
      await this.#session.get(this.options.apiURL + '?method=presence.getDailyOverview&childIds[]=' + childID)
      const responseJson = JSON.parse(this.#session.response.data)
      if (responseJson.data && responseJson.data.length > 0) {
        this.dailyOverview[childID] = responseJson.data[0]
        this.dailyOverview[childID].state = states[this.dailyOverview[childID].status]
      } else {
        this.dailyOverview[childID] = { error: 'Unable to retrieve presence data from Aula' }
      }
    }
  }

  async getMessages () {
    await this.#session.get(this.options.apiURL + '?method=messaging.getThreads&sortOn=date&orderDirection=desc&page=0')
    let unread = false
    this.messages = []
    const threadids = []
    const responseJson = JSON.parse(this.#session.response.data)
    let limit = 5
    if (!responseJson.data || !responseJson.data.threads) throw new Error('Error receiving looking up messages')
    for (const message of responseJson.data.threads) {
      if (!message.read && limit >= 0) {
        unread = true
        threadids.push(message.id)
        limit--
      }
    }
    if (unread === false) {
      this.messages = []
      return
    }
    for (const id of threadids) {
      const thread = {}
      await this.#session.get(this.options.apiURL + '?method=messaging.getMessagesForThread&threadId=' + String(id) + '&page=0')
      const responseJson = JSON.parse(this.#session.response.data)
      if (!responseJson.data || !responseJson.data.messages) throw new Error('Error receiving unread messages')
      for (const message of responseJson.data.messages) {
        if (message.messageType === 'Message') {
          try {
            thread.sendDateTime = message.sendDateTime
            thread.text = String(message.text.html).replace(/<\/?div>/g, '').replace(/(<br \/>){1,2}/g, '\n')
          } catch (_) {
            try {
              thread.text = message.text
            } catch (error) {
              thread.text = 'intet indhold...'
            }
          }
          try {
            thread.sender = message.sender.fullName
          } catch (_) {
            thread.sender = 'Ukendt afsender'
          }
          try {
            thread.subject = responseJson.data.subject
          } catch (error) {
            thread.subject = ''
          }
        }
      }
      this.messages.push(thread)
    }
  }

  async getCalender () {
    let csrfToken
    for (const cookie of this.#session.cookie.split('; ')) {
      if (cookie.toLowerCase().startsWith('csrfp-token')) {
        csrfToken = cookie.split('=')[1]
        break
      }
    }
    const start = new Date().toISOString()
    const end = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString()
    await this.#session.post(this.options.apiURL + '?method=calendar.getEventsByProfileIdsAndResourceIds', {
      json: {
        instProfileIds: this.#internals.childIDs,
        resourceIds: [],
        start,
        end
      },
      headers: { 'csrfp-token': csrfToken }
    })
    if (this.#session.response.statusCode === 200) {
      try {
        this.calendar = JSON.parse(this.#session.response.data).data
      } catch (error) {
        this.calendar = [{ error }]
      }
    }
  }

  async updateData ({ updateDailyOverview = null, updateMessage = null, updateCalendar = null }) {
    this.options.newLogin = false
    if (!this.options.apiURL) {
      try {
        await this.getProfile()
        this.options.authenticated = true
      } catch (_) { }
    }
    if (this.options.authenticated !== true) {
      await this.login()
      this.options.newLogin = true
    }
    if (updateDailyOverview === true || (updateDailyOverview === null && this.options.updateDailyOverview)) {
      try {
        await this.getDailyOverview()
      } catch (error) {
        this.dailyOverview = { error }
      }
    }
    if (updateMessage === true || (updateMessage === null && this.options.updateMessage)) {
      try {
        await this.getMessages()
      } catch (error) {
        this.messages = [{ error }]
      }
    }
    if (updateCalendar === true || (updateCalendar === null && this.options.updateCalendar)) {
      try {
        await this.getCalender()
      } catch (error) {
        this.calendar = ['error', error]
      }
    }
    this.updateDateTime = new Date().toISOString()
  }
}

module.exports = AulaClient
