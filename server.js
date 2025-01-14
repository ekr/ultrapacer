'use strict'
const express = require('express')
const path = require('path')
const mongoose = require('mongoose')
const bodyParser = require('body-parser')
const cors = require('cors')
const userRoutes = require('./server/routes/userRoutes')
const courseRoutes = require('./server/routes/courseRoutes')
const waypointRoutes = require('./server/routes/waypointRoutes')
const planRoutes = require('./server/routes/planRoutes')
const publicRoutes = require('./server/routes/publicRoutes')
const external = require('./server/routes/external')
const jwt = require('express-jwt')
const jwksRsa = require('jwks-rsa')
const patreon = require('./server/routes/patreon')
const { getSecret } = require('./server/secrets')

async function startUp () {
  const elevation = require('./server/routes/elevation')
  const email = require('./server/routes/email')
  const strava = require('./server/routes/strava')
  const mailer = require('./server/tasks/mailer')
  // connect to the database:
  mongoose.Promise = global.Promise
  mongoose.set('useFindAndModify', false)

  const keys = await getSecret(['MONGODB', 'AUTH0_DOMAIN', 'AUTH0_AUDIENCE'])

  mongoose.connect(keys.MONGODB).then(
    () => { console.log('Database is connected') },
    err => { console.log('Can not connect to the database' + err) }
  )

  const app = express()
  const DIST_DIR = path.join(__dirname, '/dist')
  const HTML_FILE = path.join(DIST_DIR, 'index.html')
  const STATIC_FOLDER = path.join(DIST_DIR, '/static')

  app.use(cors())
  app.use(bodyParser.json({ limit: '50mb' }))

  const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${keys.AUTH0_DOMAIN}/.well-known/jwks.json`
    }),

    audience: keys.AUTH0_AUDIENCE,
    issuer: `https://${keys.AUTH0_DOMAIN}/`,
    algorithm: ['RS256']
  })

  app.use('/api/user', checkJwt, userRoutes)
  app.use(['/api/course', '/api/courses'], checkJwt, courseRoutes)
  app.use('/api/waypoint', checkJwt, waypointRoutes)
  app.use('/api/plan', checkJwt, planRoutes)
  app.use('/api/elevation', elevation)
  app.use('/api/email', checkJwt, email)
  app.use('/api/patreon', checkJwt, patreon.auth) // authenticated patreon routes
  app.use('/api/open/patreon', patreon.open) // unauthenticated patreon routes
  app.use('/api/strava', strava)

  // get timezone
  app.use('/api/timezone', checkJwt, require('./server/routes/timezone'))

  app.use('/api/external', external)

  app.use('/tasks/mailer', mailer)

  // unauthenticated api routes:
  app.use('/api-public', publicRoutes)

  // redirect static files:
  app.get('/robots.txt', function (req, res) {
    res.sendFile(path.join(DIST_DIR, '/public/robots.txt'))
  })
  app.get('/sitemap.xml', function (req, res) {
    res.sendFile(path.join(DIST_DIR, '/public/sitemap.xml'))
  })

  //  this allows web components to be pathed in development
  if (process.argv.includes('development')) {
    app.get('/public/components/js/*', (req, res) => {
      const a = req.url.split('/').slice(-1)[0]
      res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
      res.header('Expires', '-1')
      res.header('Pragma', 'no-cache')
      res.sendFile(path.join(DIST_DIR, `../temp/js/${a}`))
    })
    app.get('/public/components/*.html', (req, res) => {
      const a = req.url.split('/').slice(-1)[0]
      res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
      res.header('Expires', '-1')
      res.header('Pragma', 'no-cache')
      res.sendFile(path.join(DIST_DIR, `../static/components/${a}`))
    })
  }
  // end temporary

  app.get('/*', (req, res) => {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
    res.header('Expires', '-1')
    res.header('Pragma', 'no-cache')
    res.sendFile(HTML_FILE)
  })

  const PORT = process.env.PORT || 8080
  app.listen(PORT, () => {
    console.log(`DIST_DIR: ${DIST_DIR}`)
    console.log(`HTML_FILE: ${HTML_FILE}`)
    console.log(`STATIC_FOLDER: ${STATIC_FOLDER}`)
    console.log(`App listening on port ${PORT}`)
    console.log('Press Ctrl+C to quit.')
  })
}

startUp()
