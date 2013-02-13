
var express = require('express')
  // Main App
  , app = express()
  , RedisStore = require('connect-redis')(express)
  , config = require('./config');

// Assets Path
app.use(express.static(__dirname + '/public/assets'));
app.set('views', __dirname + '/app/views');
app.set('view engine', 'jade');
// Let jade not print everything in a single line
app.locals.pretty = true;


// Parse POST Data
app.use(express.bodyParser());
// Parse Cookie Data
app.use(express.cookieParser());

// Launch Main App
var port = process.env.PORT || 8080;
app.listen(port);


// Redis

var redis = require("redis").createClient();

// Setting Up Redis Backed Sessions

app.use(
  express.session({
      secret: config.app_secret
    , store: new RedisStore({client: redis})
  })
);

// -----
// Helpers
// -----

var generateId = function() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
  });
};

// -----
// Globals
// -----
app.locals.username = 'Guest';


// =====
// Routes
// =====


// -----
// General
// -----

app.get('/', function(req, res) {
  res.render('home');
});

// Tmp Favicon Fallback
app.get('/favicon.ico', function(req, res) {
  
});

// -----
// Writeup
// -----

// Get Writeup

app.get('/w/:key', function(req, res) {
  var key = req.params.key;

  redis.hget('writeup:'+key, 'content', function(err, reply) {
    var data = {key: key, content: reply};

    res.render('home', data);
  });
  
});

// Save Writeup

app.post('/write/save', function(req, res) {
  // Storing in Redis Hashes

  // SADD writeup:key:*
  // HSET writeup:_key_ content '...'
  // HSET writeup:_key_ created_at '...'

  var key = generateId();
  var content = req.body.content
    , created_at = Date.now();

  redis.sadd('writeup:key', key);
  redis.hset('writeup:'+key, 'content', content);
  redis.hset('writeup:'+key, 'created_at', created_at);

  res.json({key: key});
});

// Update Writeup

app.post('/write/update', function(req, res) {
  var key = req.params.key;
  var content = req.body.content
    , modified_at = Date.now();

  // redis.sadd('writeup:key', key);
  redis.hset('writeup:'+key, 'content', content);
  redis.hset('writeup:'+key, 'modified_at', modified_at);

  res.json({status: 'success'});
});

// -----
// Twitter oAuth
// -----

var OAuth = require('oauth').OAuth
  , oauth = new OAuth(
      "https://api.twitter.com/oauth/request_token",
      "https://api.twitter.com/oauth/access_token",
      config.twitter_consumer_key,
      config.twitter_consumer_secret,
      "1.1A",
      "http://localhost:8080/auth/twitter/callback",
      "HMAC-SHA1"
    );

app.get('/auth/twitter', function(req, res) {

  oauth.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results) {
    if (error) {
      console.log(error);
      res.send("Authentication Failed!");
    }
    else {
      req.session.oauth = {
        token: oauth_token,
        token_secret: oauth_token_secret
      };
      // console.log(req.session.oauth);
      res.redirect('https://twitter.com/oauth/authenticate?oauth_token='+oauth_token)
    }
  });

});

app.get('/auth/twitter/callback', function(req, res, next) {

  if (req.session.oauth) {
    req.session.oauth.verifier = req.query.oauth_verifier;
    var oauth_data = req.session.oauth;

    oauth.getOAuthAccessToken(
      oauth_data.token,
      oauth_data.token_secret,
      oauth_data.verifier,
      function(error, oauth_access_token, oauth_access_token_secret, results) {

        if (error) {
          console.log(error);
          res.send("Authentication Failure!");
        }
        else {
          req.session.oauth.access_token = oauth_access_token;
          req.session.oauth.access_token_secret = oauth_access_token_secret;
          req.session.username = results.screen_name;
          // console.log(results, req.session.oauth);

          // Save in DB
          redis.incr('user_id');
          redis.get('user_id', function(err, reply) {
            if (err || !reply) {
              console.log(err, reply);
              return;
            }

            var id = parseInt(reply);
            redis.sadd('user:id', id);
            redis.hset('user:'+id, 'username', results.screen_name);
            redis.hset('user:'+id, 'service_user_id', results.user_id);

            // Set global vars for templates
            app.locals.username = results.screen_name;

            res.redirect('/');
          });
        }

        return;
      }
    );
  }
  else {
    res.redirect('/login'); // Redirect to login page
  }

});

// -----
// User Profile
// -----