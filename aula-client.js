'use strict'
const Webhead = require('webhead')
const cheerio = require('cheerio')
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

  options = { apiVersion: 17, authenticated: false }

  constructor ({ username, password, cookieStore = null }) {
    if (!username || typeof username !== 'string') throw new Error('Username must be a string')
    if (!password || typeof password !== 'string') throw new Error('Password must be a string')
    this.#internals.username = username
    this.#internals.password = password
    this.#internals.cookieStore = cookieStore
    this.init()
  }

  init () {
    if (this.#internals.cookieStore) {
      try {
        this.#session = Webhead({ jarFile: this.#internals.cookieStore })
      } catch (_) {
        this.#internals.cookieStore = null
      }
    }
    if (!this.#internals.cookieStore) {
      this.#session = Webhead()
    }
  }

  async login () {
    this.options.authenticated = false
    await this.#session.get('https://login.aula.dk/auth/login.php?type=unilogin')
    // Special case if redirected to aula.dk/portal/ then cookies are still valid and you cant login since you already are
    if (String(this.#session.url) === 'https://www.aula.dk/portal/') {
      this.options.authenticated = true
      await this.getProfile()
      return true
    }
    const data = {
      selectedIdp: 'uni_idp'
    }
    await this.#session.submit('form', data)
    const userData = { username: this.#internals.username, password: this.#internals.password, 'selected-aktoer': 'KONTAKT' }
    let redirects = 0
    let success = false
    while (success === false && redirects < 14) {
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
      // If there are no input fields. Make sure to handle the shown buttons correctly
      let choice = null
      if (!this.#session.$('input').length && this.#session.$('button').length) {
        for (const button of this.#session.$('button')) {
          if (button.attribs.name === 'wait') {
            // This happens close to password expiry
            await this.#session.submit('form', { wait: '' })
            choice = true
            break
          }
        }
        // Grab error text. This will happen after password expiry
        if (this.#session.$('.alert-text') && this.#session.$('.alert-text').length) {
          throw new Error(this.stringCleanHTML(this.#session.$('.alert-text').html()))
        }
        // if (!choice) {
        //   console.log('-----------')
        //   console.log('redirects', redirects)
        //   console.log(this.#session.$('form').html())
        //   console.log('-----------')
        // }
      }
      if (!choice) {
        await this.#session.submit('form', postData)
      }
      if (String(this.#session.url) === 'https://www.aula.dk/portal/') {
        success = true
      }
      redirects += 1
    }
    if (!success) throw new Error(`Unilogin failed at url ${this.#session.url} after ${redirects} redirects`)
    this.options.authenticated = true
    await this.getProfile()
    return true
  }

  async clearSession () {
    try {
      await this.#session.clearCookies()
      if (this.#internals.cookieStore) {
        await fs.unlink(this.#internals.cookieStore).catch()
      }
      this.init()
    } catch (_) {
      return false
    }
    return true
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
    return true
  }

  async checkLoggedIn () {
    let authenticated = false
    let clearSession = false
    if (this.options.apiURL) {
      try {
        await this.#session.get(this.options.apiURL + '?method=messaging.getThreads&sortOn=date&orderDirection=desc&page=0')
        if (this.#session.response.statusCode !== 200) throw new Error()
        authenticated = true
      } catch (_) {
        clearSession = true
      }
    } else {
      try {
        await this.getProfile()
        authenticated = true
      } catch (_) {
        clearSession = true
      }
    }
    if (clearSession) await this.clearSession()
    if (authenticated !== true) {
      await this.login()
    }
  }

  async getDailyOverview (skipCheckLoggedIn = false) {
    if (!skipCheckLoggedIn) await this.checkLoggedIn()
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
        throw new Error('Unable to retrieve getDailyOverview data from Aula')
      }
    }
    return this.dailyOverview
  }

  /**
   *
   * @returns returns string with csrf token as found inside cookie
   */
  csrfToken () {
    for (const cookie of this.#session.cookie.split('; ')) {
      if (cookie.toLowerCase().startsWith('csrfp-token')) {
        return cookie.split('=')[1]
      }
    }
    return ''
  }

  stringCleanHTML (inputString) {
    inputString = String(inputString)
    try {
      inputString = cheerio.load(inputString).text()
    } catch (error) {
      try {
        inputString = inputString
          .replace(/<\/?div>/g, '')
          .replace(/(<br \/>){1,2}/g, '\n')
          .replace(/<p>/g, '\n')
          .replace(/<\/p>/g, '')
      } catch { }
    }
    inputString = inputString.replace(/\s+/g, ' ')
    return inputString
  }

  async getMessages (skipCheckLoggedIn = false) {
    if (!skipCheckLoggedIn) await this.checkLoggedIn()
    await this.#session.get(this.options.apiURL + '?method=messaging.getThreads&sortOn=date&orderDirection=desc&page=0')
    let unread = false
    this.messages = []
    const threadids = []
    let markAsReadPoint = {}
    const responseJson = JSON.parse(this.#session.response.data)
    let limit = 5
    if (!responseJson.data || !responseJson.data.threads) throw new Error('Error looking up messages')
    for (const message of responseJson.data.threads) {
      if (!message.read && limit >= 0) {
        unread = true
        threadids.push(message.id)
        limit--
        markAsReadPoint = {
          threadId: message.id,
          messageId: null,
          commonInboxId: null,
          otpInboxId: null
        }
      }
    }
    for (const id of threadids) {
      const thread = {}
      await this.#session.get(this.options.apiURL + '?method=messaging.getMessagesForThread&threadId=' + String(id) + '&page=0')
      const responseJson = JSON.parse(this.#session.response.data)
      if (!responseJson.data || !responseJson.data.messages) throw new Error('Error receiving unread messages')
      for (const message of responseJson.data.messages) {
        if (message.messageType !== 'Message') continue
        // Use the first and newest message id to note into the markAsReadPoint object
        if (markAsReadPoint.messageId === null) markAsReadPoint.messageId = message.id
        try {
          thread.sendDateTime = message.sendDateTime
          thread.text = this.stringCleanHTML(message.text.html)
        } catch (_) {
          try {
            thread.text = String(message.text)
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
      const markAsRead = { notifications: [{ notificationId: `NewMessagePrivateInbox:${id}:Badge`, institutionProfileId: responseJson.data.mailBoxOwner.id }] }
      this.messages.push(thread)
      // Mark message as read just like with notifications:
      this.#session.post(this.options.apiURL + '?method=Notifications.deleteNotifications', {
        json: markAsRead,
        headers: { 'csrfp-token': this.csrfToken() }
      }).then(response => console.trace(response))
        .catch(error => console.trace(error))

      // this.#session.get(this.options.apiURL + '?method=messaging.getMessagesForThread&threadId='+id+'&page=0', {
      //   headers: { 'csrfp-token': this.csrfToken() }
      // }).then(response => console.trace(response))
      // .catch(error => console.warn(error))
    }
    if (unread === true) {
      // Mark as read from this point
      await this.#session.post(this.options.apiURL + '?method=messaging.setLastReadMessage', {
        json: markAsReadPoint,
        headers: { 'csrfp-token': this.csrfToken() }
      })
    }
    return this.messages
  }

  async getCalender (skipCheckLoggedIn = false) {
    if (!skipCheckLoggedIn) await this.checkLoggedIn()
    const start = new Date().toISOString()
    const end = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString()
    await this.#session.post(this.options.apiURL + '?method=calendar.getEventsByProfileIdsAndResourceIds', {
      json: {
        instProfileIds: this.#internals.childIDs,
        resourceIds: [],
        start,
        end
      },
      headers: { 'csrfp-token': this.csrfToken() }
    })
    if (this.#session.response.statusCode === 200) {
      this.calendar = JSON.parse(this.#session.response.data).data
    }
    return this.calendar
  }

  /**
   *
   * @param {boolean|timestamp} getReadPosts default to false meaning only get new posts. Also accept any string parable by new Date() to get posts between that date and now.
   * @param {int} limit default to 10. limit of amount of posts to get
   * @param {boolean} onlyEmployeePosts default to false. only get posts from employees and not other parents
   * @returns returns unread posts. Also returns read posts if getReadPosts is true or set to time in the past
   */
  async getPosts (getReadPosts = false, limit = 10, onlyEmployeePosts = false, skipCheckLoggedIn = false) {
    if (!skipCheckLoggedIn) await this.checkLoggedIn()
    let query = ''
    if (onlyEmployeePosts === true) query += '&creatorPortalRole=employee'
    for (const institution of this.#internals.profiles[0].institutionProfiles) {
      query += `&institutionProfileIds[]=${institution.id}`
    }
    for (const child of this.#internals.profiles[0].children) {
      query += `&institutionProfileIds[]=${child.id}`
    }
    await this.#session.get(this.options.apiURL + '?method=posts.getAllPosts&parent=profile&index=0' + query + '&limit=' + limit)
    const responseJson = JSON.parse(this.#session.response.data)
    if (new Date(getReadPosts) > 1) responseJson.data.profileLastSeenPostDate = new Date(getReadPosts).toISOString()
    const posts = []
    for (const message of responseJson.data.posts) {
      // Check if post is new. First old post breaks the for loop
      if (message.timestamp < responseJson.data.profileLastSeenPostDate && getReadPosts !== true) break
      const post = {}
      try {
        post.sendDateTime = message.timestamp
        post.text = this.stringCleanHTML(message.content.html)
      } catch (_) {
        try {
          post.text = String(message.content)
        } catch (error) {
          post.text = 'intet indhold...'
        }
      }
      try {
        post.sender = message.ownerProfile.fullName
      } catch (_) {
        post.sender = 'Ukendt afsender'
      }
      try {
        post.subject = message.title
      } catch (error) {
        post.subject = ''
      }
      posts.push(post)
    }
    return posts
  }

  async getNotifications (skipCheckLoggedIn = false) {
    if (!skipCheckLoggedIn) await this.checkLoggedIn()
    let query = ''
    for (const child of this.#internals.profiles[0].children) {
      query += `&activeChildrenIds[]=${child.id}`
    }
    await this.#session.get(this.options.apiURL + '?method=notifications.getNotificationsForActiveProfile' + query)
    if (this.#session.response.statusCode !== 200) throw new Error('Error getting notifications')
    const responseJson = JSON.parse(this.#session.response.data)
    const notifications = []
    const handledIDs = []
    const markAsRead = { notifications: [] }
    // await fs.writeFile('logs/notification2.json', this.#session.response.data)
    for (const notification of responseJson.data) {
      for (const institution of this.#internals.profiles[0].institutionProfiles) {
        if (institution.id === notification.institutionProfileId) notification.sender = institution.institutionName
      }
      if (notification.notificationEventType === 'VacationResponseRequired') {
        if (handledIDs.includes(notification.eventId)) continue
        notifications.push({
          sendDateTime: notification.triggered,
          text: notification.noteToGuardians,
          subject: notification.vacationRequestName,
          sender: notification.sender
        })
        handledIDs.push(notification.eventId)
      } else if (notification.notificationEventType === 'PostSharedWithMe' || notification.notificationEventType === 'MediaAddedToAlbum' || notification.notificationEventType === 'NewMedia') {
        // Ignore notifications that can be found as posts also
        // ignore notification about an album and NewMedia and look for the tagged event instead
        continue
      } else if (notification.notificationEventType === 'TaggedInMedia') {
        markAsRead.notifications.push({ institutionProfileId: notification.institutionProfileId, notificationId: notification.notificationId })
        if (notification.notificationType !== 'Alert') continue
        if (handledIDs.includes('TaggedInMedia' + notification.relatedChildName)) continue
        notifications.push({
          sendDateTime: notification.triggered,
          text: 'New images of ' + notification.relatedChildName.split(' ')[0],
          subject: notification.notificationArea,
          sender: notification.sender
        })
        handledIDs.push('TaggedInMedia' + notification.relatedChildName)
      } else {
        console.warn('unhandled notificationEventType in notification: ' + notification.notificationEventType)
        console.log(notification)
      }
    }
    // Delete notifications, ignore any error
    this.#session.post(this.options.apiURL + '?method=Notifications.deleteNotifications', {
      json: markAsRead,
      headers: { 'csrfp-token': this.csrfToken() }
    }).catch(error => error)
    return notifications
  }

  async getAlbums (skipCheckLoggedIn = false) {
    if (!skipCheckLoggedIn) await this.checkLoggedIn()
    let query = ''
    for (const child of this.#internals.profiles[0].children) {
      query += `&filterInstProfileIds[]=${child.id}`
    }
    await this.#session.get(this.options.apiURL + '?method=gallery.getAlbums&index=0&limit=12&sortOn=mediaCreatedAt&orderDirection=desc&filterBy=all' + query)
    if (this.#session.response.statusCode !== 200) throw new Error('Error getting albums')
    const responseJson = JSON.parse(this.#session.response.data)
    const albums = []
    for (const album of responseJson.data) {
      if (album.id === null) continue
      albums.push({
        sendDateTime: album.creationDate,
        text: album.description,
        subject: album.title,
        sender: album.creator.name
      })
    }
    return albums
  }
}

module.exports = AulaClient
