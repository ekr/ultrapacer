const express = require('express')
const router = express.Router()
const nodemailer = require('nodemailer')
const moment = require('moment-timezone')
const Course = require('../models/Course')
const Plan = require('../models/Plan')
const Vue = require('vue')
const fs = require('fs')
const path = require('path')
const renderer = require('vue-server-renderer').createRenderer({
  template: fs.readFileSync(path.join(__dirname, '../templates/email.html'), 'utf-8')
})
const { getSecret } = require('../secrets')

// emailing all users weekend email
router.route('/good-luck').get(async function (req, res) {
  if (!req.headers['x-appengine-cron']) {
    res.status(403).send('No permission')
    return
  }

  try {
    const friday = moment().day(5).hour(0).minute(0).second(0).toDate()
    const monday = moment().day(1).hour(0).minute(0).second(0).add(1, 'weeks').toDate()
    const dq = [{ eventStart: { $gte: friday } }, { eventStart: { $lt: monday } }]

    // get all courses for this weekend:
    const courses = await Course.find({ $and: dq }).select('name ').exec()

    // get all plans for this weekend
    const plans = await Plan.find(
      {
        $or: [
          {
            $and: [
              { eventStart: null },
              {
                _course: {
                  $in: courses.map(c => { return c._id })
                }
              }
            ]
          },
          { $and: dq }
        ]
      }
    ).select(['name', 'eventStart']).populate([{ path: '_user', select: 'email' }, { path: '_course', select: 'name eventStart eventTimezone' }]).exec()

    // get list of unique users:
    let users = plans.filter(p => p._user && p._user.email).map(p => { return p._user }).sort((a, b) => a.email < b.email ? -1 : 1)
    users = users.filter((u, i) => i === 0 || u.email !== users[i - 1].email)

    users.forEach(async (user) => {
      let userplans = plans.filter(p => p._user && p._user.email === user.email).sort((a, b) => a._course.name < b._course.name ? -1 : 1)
      userplans = userplans.filter((p, i) => i === 0 || p._course._id !== userplans[i - 1]._course._id)
      userplans.forEach(up => { up.day = moment(up.eventStart ? up.eventStart : up._course.eventStart).tz(up._course.eventTimezone).format('dddd') })

      const html = await renderEmail('Good luck!', 'weekend.vue', { userplans: userplans })
      if (html) {
        // get keys:
        const keys = await getSecret(['SMTP_USERNAME', 'SMTP_PASSWORD'])

        // create reusable transporter object using the default SMTP transport
        const transporter = nodemailer.createTransport({
          service: 'SendinBlue',
          auth: {
            user: keys.SMTP_USERNAME,
            pass: keys.SMTP_PASSWORD
          }
        })

        // send mail
        transporter.sendMail({
          from: '"ultraPacer" <no-reply@ultrapacer.com>',
          to: user.email,
          subject: 'Good luck this weekend',
          text: `Good luck this weekend with ${userplans[0]._course.name}!`,
          html: html
        })
      }
    })

    res.json('Messages Sent')
  } catch (err) {
    console.log(err)
    res.status(400).send(err)
  }
})

router.route('/test/good-luck').get(async function (req, res) {
  const html = await renderEmail('testing', 'weekend.vue', {
    userplans: [
      { _course: { name: 'hundo' }, day: 'Saturday' },
      { _course: { name: '5k' }, day: 'Sunday' }
    ]
  })
  res.send(html)
})

async function renderEmail (title, template, data) {
  const context = {
    title: title
  }
  const app = new Vue({
    data: data,
    template: fs.readFileSync(path.join(__dirname, `../templates/${template}`), 'utf-8')
  })
  let res = ''
  await renderer.renderToString(app, context, (err, html) => {
    if (err) {
      console.log(err)
    } else {
      res = html
    }
  })
  return res
}

module.exports = router
