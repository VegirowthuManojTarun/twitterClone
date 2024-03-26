const express = require('express')
const path = require('path')
const app = express()

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const dbPath = path.join(__dirname, 'twitterClone.db')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
app.use(express.json())
let db = null

const initDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () => {
      console.log('Server is running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(e.message)
    process.exit(1)
  }
}
initDbAndServer()

const authenticateToken = (request, response, next) => {
  let awtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    awtToken = authHeader.split(' ')[1]
  }
  if (awtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(awtToken, 'secret_token', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        const userIdQuery = `SELECT user_id FROM user
        where username = '${payload.username}';`
        const userId = await db.get(userIdQuery)
        request.userId = userId.user_id
        next()
      }
    })
  }
}

//api11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const isHisOwnTweet = `
    select user_id from tweet
    where tweet_id = ${tweetId};`
    const checkTweets = await db.get(isHisOwnTweet)
    if (checkTweets === undefined || checkTweets.user_id !== request.userId) {
      response.status(401)
      response.send('Invalid Request')
      return
    } else {
      const deleteTweetQuery = `
        delete from tweet
        where tweet_id = ${tweetId}
      ;`
      await db.run(deleteTweetQuery)
      response.send('Tweet Removed')
      return
    }
  },
)

//api10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const insertTweetQuery = `
  insert into tweet(tweet,user_id)
  values("${tweet}",${request.userId});`
  await db.run(insertTweetQuery)
  response.send('Created a Tweet')
})

//api9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const getTweetLikesQuery = `
    select tweet,
    count(distinct l.like_id) as likes,
    count(distinct r.reply_id) as replies,
    t.date_time as dateTime
    from tweet t left join
    (reply r join like l on r.tweet_id=l.tweet_id) 
    on t.tweet_id=r.tweet_id
    where t.tweet_id in (
      select tweet_id from tweet 
      where user_id = ${request.userId}
    ) 
    group by t.tweet_id;`
  const dbLikes = await db.all(getTweetLikesQuery)
  console.log(dbLikes)
  response.send(dbLikes)
})

//api8
app.get(
  '/tweets/:tweetId/replies',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const isFollowingQuery = `
  select following_user_id from
  follower
  where follower_user_id = ${request.userId};`
    const tweets = await db.get(isFollowingQuery)
    console.log(tweets)
    if (tweets === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const getTweetLikedUsersQuery = `
    select username as name,reply from user join reply
    on user.user_id = reply.user_id
    where tweet_id = ${tweetId};`
      const dbLikes = await db.all(getTweetLikedUsersQuery)
      console.log(dbLikes)

      response.send({
        replies: dbLikes,
      })
    }
  },
)

//api7
app.get(
  '/tweets/:tweetId/likes',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const isFollowingQuery = `
  select following_user_id from
  follower
  where follower_user_id = ${request.userId};`
    const tweets = await db.get(isFollowingQuery)
    console.log(tweets)
    if (tweets === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const getTweetLikedUsersQuery = `
    select username from user join like
    on user.user_id = like.user_id
    where tweet_id = ${tweetId};`
      const dbLikes = await db.all(getTweetLikedUsersQuery)
      console.log(dbLikes)
      const likedUsers = []
      for (let user of dbLikes) {
        likedUsers.push(user.username)
      }
      response.send({
        likes: likedUsers,
      })
    }
  },
)

//api6
app.get('/tweets/:tweetId', authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  const getTweetsQuery = `
  select * from tweet 
  where user_id in
  (select following_user_id from
  follower
  where follower_user_id = ${request.userId})
  and tweet_id = ${tweetId};`
  const tweets = await db.get(getTweetsQuery)
  console.log(tweets)
  if (tweets === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const getTweetRepliesQuery = `
    select count(reply_id) as replies
    from reply 
    group by tweet_id
    having tweet_id = ${tweetId};`
    const dbReplies = await db.get(getTweetRepliesQuery)

    const getTweetLikesQuery = `
    select count(like_id) as likes
    from like 
    group by tweet_id
    having tweet_id = ${tweetId};`
    const dbLikes = await db.get(getTweetLikesQuery)

    response.send({
      tweet: tweets.tweet,
      likes: dbLikes.likes,
      replies: dbReplies.replies,
      dateTime: tweets.date_time,
    })
  }
})

//api5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const getFollowingQuery = `
  select username from user 
  where user_id in
  (select follower_user_id from
  follower
  where following_user_id = ${request.userId})`
  const followers = await db.all(getFollowingQuery)

  response.send(followers)
})

//api4
app.get('/user/following/', authenticateToken, async (request, response) => {
  const getFollowingQuery = `
  select username from user 
  where user_id in
  (select following_user_id from
  follower
  where follower_user_id = ${request.userId});`
  const following = await db.all(getFollowingQuery)

  response.send(following)
})

//api3
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const getFeedQuery = `select username,tweet,date_time as dateTime
  from user join tweet on
  user.user_id = tweet.user_id 
   where tweet.user_id in (
    select following_user_id from
    follower
    where follower_user_id = ${request.userId});
   )
  order by date_time DESC limit 4;`
  const tweets = await db.all(getFeedQuery)
  response.send(tweets)
})

//api2
app.post('/register/', async (request, response) => {
  const userInfo = request.body
  const {username, name, password, gender, location} = userInfo
  const userQuery = `
  SELECT * FROM user
  WHERE username = '${username}'
  ;`
  const dbUser = await db.get(userQuery)
  //console.log(dbUser)
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const insertUserQuery = `
      INSERT INTO user(username,password,name,gender)
      VALUES(
        '${username}',
        '${hashedPassword}',
        '${name}',
        '${gender}'
      )
      ;`
      await db.run(insertUserQuery)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//api1
app.post('/login/', async (request, response) => {
  const loginDetails = request.body
  const {username, password} = loginDetails
  const isInQuery = `
  SELECT * FROM user
  WHERE username = '${username}'
  ;`
  const dbInUser = await db.get(isInQuery)
  //console.log(dbUser)
  if (dbInUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordEqual = await bcrypt.compare(password, dbInUser.password)
    if (isPasswordEqual) {
      const payload = {username}
      const jwtToken = jwt.sign(payload, 'secret_token')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//api0.2
app.put('/change-password', async (request, response) => {
  const newPasswordDetails = request.body
  const {username, oldPassword, newPassword} = newPasswordDetails
  const userCheckQuery = `
  SELECT * FROM user
  WHERE username = '${username}'
  ;`
  const dbUser = await db.get(userCheckQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid User')
  } else {
    const isPasswordEqual = await bcrypt.compare(oldPassword, dbUser.password)
    if (isPasswordEqual) {
      if (newPassword.length < 5) {
        response.status(400)
        response.send('Password is too short')
      } else {
        const hashedPassword = await bcrypt.hash(newPassword, 10)
        const passwordUpdateQuery = `
              UPDATE user
              SET password = "${hashedPassword}"
              WHERE username = "${username}"
            ;`
        await db.run(passwordUpdateQuery)
        response.status(200)
        response.send('Password updated')
      }
    } else {
      response.status(400)
      response.send('Invalid current password')
    }
  }
})

//api0.3
app.get('/users/', async (request, response) => {
  const getUsersQuery = `SELECT * FROM user;`
  const users = await db.all(getUsersQuery)
  response.send(users)
})

module.exports = app
