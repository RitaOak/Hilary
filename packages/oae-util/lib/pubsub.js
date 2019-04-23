/*!
 * Copyright 2014 Apereo Foundation (AF) Licensed under the
 * Educational Community License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may
 * obtain a copy of the License at
 *
 *     http://opensource.org/licenses/ECL-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS"
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

import { EventEmitter } from 'oae-emitter';
import * as Redis from './redis';
import { Validator } from './validator';

/*!
 * This module abstracts most of the redis publish/subscribe functions away.
 * It will listen to all channels and emit an event for each message it receives.
 * The redis channel name will be the event name and the message it's only argument.
 */

// Create the event emitter
const emitter = new EventEmitter();
let redisManager = null;
let redisSubscriber = null;
let redisPublisher = null;

/**
 * Initializes the connection to redis.
 */
const init = function(config, callback) {
  // Only init if the connections haven't been opened.
  if (redisManager === null) {
    // Create 3 clients, one for managing redis and 2 for the actual pub/sub communication.
    Redis.createClient(config, (err, client) => {
      if (err) {
        return callback(err);
      }

      redisManager = client;
      Redis.createClient(config, (err, client) => {
        if (err) {
          return callback(err);
        }

        redisSubscriber = client;
        Redis.createClient(config, (err, client) => {
          if (err) {
            return callback(err);
          }

          redisPublisher = client;

          // Listen to all channels and emit them as events.
          redisSubscriber.on('pmessage', (pattern, channel, message) => {
            emitter.emit(channel, message);
          });
          redisSubscriber.psubscribe('*');
          return callback();
        });
      });
    });
  }
};

/**
 * Broadcast a message accross a channel.
 * This can be used to publish messages to all the app nodes.
 *
 * @param  {String}    channel          The channel you wish to publish on. ex: 'oae-tenants'
 * @param  {String}    message          The message you wish to send on a channel. ex: 'start 2000'
 * @param  {Function}  callback         Standard callback function
 * @param  {Object}    callback.err     An error that occurred, if any
 */
const publish = function(channel, message, callback) {
  callback = callback || function() {};
  const validator = new Validator();
  validator.check(channel, { code: 400, msg: 'No channel was provided.' }).notEmpty();
  validator.check(message, { code: 400, msg: 'No message was provided.' }).notEmpty();
  if (validator.hasErrors()) {
    return callback(validator.getFirstError());
  }

  redisPublisher.publish(channel, message, callback);
};

export { publish, init, emitter };
