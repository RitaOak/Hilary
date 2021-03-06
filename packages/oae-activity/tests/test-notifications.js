/*
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

import assert from 'assert';
import _ from 'underscore';

import { ContentConstants } from 'oae-content/lib/constants';
import * as EmailTestsUtil from 'oae-email/lib/test/util';
import * as OaeUtil from 'oae-util/lib/util';
import * as RestAPI from 'oae-rest';
import * as TestsUtil from 'oae-tests';

import { ActivityConstants } from 'oae-activity/lib/constants';
import * as ActivityModel from 'oae-activity/lib/model';
import * as ActivityRouter from 'oae-activity/lib/internal/router';
import * as ActivityTestsUtil from 'oae-activity/lib/test/util';

describe('Notifications', () => {
  // Rest context that can be used every time we need to make a request as an anonymous user
  let anonymousCamRestContext = null;

  // Rest context that can be used every time we need to make a request as a tenant admin
  let camAdminRestContext = null;

  // Rest context that can be used every time we need to make a request as a global admin
  let globalAdminRestContext = null;

  /*!
   * Create a default activity configuration object, overridden with the given `overlay` object.
   *
   * @param  {Object}    overlay     Configuration properties with which to overide the default.
   * @return {Object}                An object that represents the default configuration for unit tests, overridden by the overlay.
   */
  const createDefaultConfig = function(overlay) {
    return _.extend({ collectionPollingFrequency: -1 }, overlay);
  };

  /**
   * Function that will fill up the tenant admin and anymous rest context
   */
  before(callback => {
    anonymousCamRestContext = TestsUtil.createTenantRestContext(global.oaeTests.tenants.cam.host);
    camAdminRestContext = TestsUtil.createTenantAdminRestContext(global.oaeTests.tenants.cam.host);
    globalAdminRestContext = TestsUtil.createGlobalAdminRestContext();
    return callback();
  });

  describe('Notification Stream', () => {
    /**
     * Test that verifies anonymous cannot get a notification stream
     */
    it('verify anonymous cannot get a notification stream', callback => {
      TestsUtil.generateTestUsers(camAdminRestContext, 1, (err, createdUsers) => {
        assert.ok(!err);
        RestAPI.Activity.getNotificationStream(anonymousCamRestContext, null, (err, response) => {
          assert.ok(err);
          assert.strictEqual(err.code, 401);
          assert.ok(!response);
          return callback();
        });
      });
    });

    /**
     * Test that verifies notifications are not sent to the actor of an activity.
     */
    it('verify a notification is never sent to the actor of an activity', callback => {
      TestsUtil.generateTestUsers(camAdminRestContext, 2, (err, createdUsers) => {
        assert.ok(!err);
        const mrvisser = createdUsers[_.keys(createdUsers)[0]];
        const simong = createdUsers[_.keys(createdUsers)[1]];

        // Create content with simong as a user
        RestAPI.Content.createLink(
          mrvisser.restContext,
          'Google',
          'Google',
          'private',
          'http://www.google.ca',
          [],
          [simong.user.id],
          [],
          (err, content) => {
            assert.ok(!err);

            // Sanity check that the content is in simong's notification stream
            ActivityTestsUtil.collectAndGetNotificationStream(
              simong.restContext,
              null,
              (err, notificationStream) => {
                assert.ok(!err);
                assert.strictEqual(notificationStream.items.length, 1);
                assert.strictEqual(notificationStream.items[0].actor['oae:id'], mrvisser.user.id);
                assert.strictEqual(notificationStream.items[0].object['oae:id'], content.id);

                // Verify that no notification was routed to mrvisser, as they performed the action and this would be super annoying
                ActivityTestsUtil.collectAndGetNotificationStream(
                  mrvisser.restContext,
                  null,
                  (err, notificationStream) => {
                    assert.ok(!err);
                    assert.strictEqual(notificationStream.items.length, 0);
                    return callback();
                  }
                );
              }
            );
          }
        );
      });
    });

    /**
     * Test that verifies a notification is sent to users when a content item is created with them as a member
     */
    it('verify a notification is sent when creating content with a user member', callback => {
      TestsUtil.generateTestUsers(camAdminRestContext, 2, (err, createdUsers) => {
        assert.ok(!err);
        const mrvisser = createdUsers[_.keys(createdUsers)[0]];
        const simong = createdUsers[_.keys(createdUsers)[1]];

        // Create content with simong as a user and verify it winds up in the notification stream
        RestAPI.Content.createLink(
          mrvisser.restContext,
          'Google',
          'Google',
          'private',
          'http://www.google.ca',
          [],
          [simong.user.id],
          [],
          (err, content) => {
            assert.ok(!err);

            ActivityTestsUtil.collectAndGetNotificationStream(
              simong.restContext,
              null,
              (err, notificationStream) => {
                assert.ok(!err);
                assert.strictEqual(notificationStream.items.length, 1);
                assert.strictEqual(notificationStream.items[0].actor['oae:id'], mrvisser.user.id);
                assert.strictEqual(notificationStream.items[0].object['oae:id'], content.id);
                return callback();
              }
            );
          }
        );
      });
    });

    /**
     * Test that verifies that receiving non-aggregating notifications will appropriately update the unreadNotificationsCount
     */
    it('verify unread notifications count', callback => {
      TestsUtil.generateTestUsers(camAdminRestContext, 2, (err, createdUsers, mrvisser, simong) => {
        assert.ok(!err);

        // Ensure simong's notifications unread count starts at 0
        RestAPI.User.getMe(simong.restContext, (err, me) => {
          assert.ok(!err);
          assert.ok(!me.notificationsUnread);

          // Mrvisser shares a content item with simong, it should generate a notification
          RestAPI.Content.createLink(
            mrvisser.restContext,
            'Google',
            'Google',
            'private',
            'http://www.google.ca',
            [],
            [simong.user.id],
            [],
            (err, link0) => {
              assert.ok(!err);
              ActivityTestsUtil.collectAndGetNotificationStream(
                simong.restContext,
                null,
                (err, notificationStream) => {
                  assert.ok(!err);

                  // Ensure simong's notifications unread count is now 1
                  RestAPI.User.getMe(simong.restContext, (err, me) => {
                    assert.ok(!err);
                    assert.strictEqual(me.notificationsUnread, 1);

                    // Mrvisser shares another item with simong
                    RestAPI.Content.createLink(
                      mrvisser.restContext,
                      'Google',
                      'Google',
                      'private',
                      'http://www.google.ca',
                      [],
                      [simong.user.id],
                      [],
                      (err, link1) => {
                        assert.ok(!err);
                        ActivityTestsUtil.collectAndGetNotificationStream(
                          simong.restContext,
                          null,
                          (err, notificationStream) => {
                            assert.ok(!err);

                            // Since it aggregates with the previous, simong's notifications count should still be 1
                            RestAPI.User.getMe(simong.restContext, (err, me) => {
                              assert.ok(!err);
                              assert.strictEqual(me.notificationsUnread, 1);

                              // Simon resets his notifications by reading them. This resets both the count and aggregation
                              RestAPI.Activity.markNotificationsRead(simong.restContext, err => {
                                // Ensure the notification count resets to 0
                                RestAPI.User.getMe(simong.restContext, (err, me) => {
                                  assert.ok(!err);
                                  assert.strictEqual(me.notificationsUnread, 0);

                                  /*!
                                   * Share two things at once before aggregating. This verifies the case where 2
                                   * items are aggregated together in memory, not in the feed.
                                   *
                                   * Note that just because 2 aggregating items are aggregating in the same cycle
                                   * doesn't mean they're aggregated together in-memory, that only happens if they
                                   * are dropped in the same routed activity bucket. If the config value
                                   * `numberOfProcessingBuckets` is `1`, then it will happen all the time. If it
                                   * is larger than `1` and this functionality regresses, then this will be an
                                   * intermittent test failure.
                                   */

                                  RestAPI.Content.createLink(
                                    mrvisser.restContext,
                                    'Google',
                                    'Google',
                                    'private',
                                    'http://www.google.ca',
                                    [],
                                    [simong.user.id],
                                    [],
                                    (err, link2) => {
                                      assert.ok(!err);
                                      RestAPI.Content.createLink(
                                        mrvisser.restContext,
                                        'Google',
                                        'Google',
                                        'private',
                                        'http://www.google.ca',
                                        [],
                                        [simong.user.id],
                                        [],
                                        (err, link3) => {
                                          assert.ok(!err);
                                          ActivityTestsUtil.collectAndGetNotificationStream(
                                            simong.restContext,
                                            null,
                                            (err, notificationStream) => {
                                              assert.ok(!err);

                                              // Sanity check that these items are a single aggregate activity
                                              assert.strictEqual(
                                                notificationStream.items.length,
                                                2
                                              );
                                              assert.ok(
                                                _.isArray(
                                                  notificationStream.items[0].object[
                                                    'oae:collection'
                                                  ]
                                                )
                                              );

                                              const linkIdsInFeed = _.pluck(
                                                notificationStream.items[0].object[
                                                  'oae:collection'
                                                ],
                                                ActivityConstants.properties.OAE_ID
                                              );
                                              assert.strictEqual(linkIdsInFeed.length, 2);
                                              assert.ok(_.contains(linkIdsInFeed, link2.id));
                                              assert.ok(_.contains(linkIdsInFeed, link3.id));

                                              // Ensure that simon's notification count increments by only 1
                                              RestAPI.User.getMe(simong.restContext, (err, me) => {
                                                assert.ok(!err);
                                                assert.strictEqual(me.notificationsUnread, 1);

                                                return callback();
                                              });
                                            }
                                          );
                                        }
                                      );
                                    }
                                  );
                                });
                              });
                            });
                          }
                        );
                      }
                    );
                  });
                }
              );
            }
          );
        });
      });
    });
  });

  describe('Mark Notifications Read', () => {
    /**
     * Test that verifies anonymous cannot mark a notification stream as read
     */
    it('verify anonymous cannot mark a notification stream as read', callback => {
      RestAPI.Activity.markNotificationsRead(anonymousCamRestContext, err => {
        assert.ok(err);
        assert.strictEqual(err.code, 401);
        return callback();
      });
    });

    /**
     * Test that verifies marking notifications as read and counts work.
     */
    it('verify toggling of notifications read', callback => {
      TestsUtil.generateTestUsers(camAdminRestContext, 2, (err, createdUsers) => {
        assert.ok(!err);
        const mrvisser = createdUsers[_.keys(createdUsers)[0]];
        const simong = createdUsers[_.keys(createdUsers)[1]];

        RestAPI.User.getMe(simong.restContext, (err, me) => {
          assert.ok(!err);
          assert.ok(!me.notificationsUnread);
          assert.ok(!me.notificationsLastRead);

          // Create content with simong as a member
          RestAPI.Content.createLink(
            mrvisser.restContext,
            'Google',
            'Google',
            'private',
            'http://www.google.ca',
            [],
            [simong.user.id],
            [],
            (err, firstContentObj) => {
              assert.ok(!err);

              // Ensure the notification gets delivered
              ActivityTestsUtil.collectAndGetNotificationStream(
                simong.restContext,
                null,
                (err, notificationStream) => {
                  assert.ok(!err);
                  assert.strictEqual(notificationStream.items.length, 1);
                  assert.strictEqual(notificationStream.items[0].actor['oae:id'], mrvisser.user.id);
                  assert.strictEqual(
                    notificationStream.items[0].object['oae:id'],
                    firstContentObj.id
                  );

                  // Verify the notificationsUnread status
                  RestAPI.User.getMe(simong.restContext, (err, me) => {
                    assert.ok(!err);

                    // We now have unread notifications, but still no "lastRead" status
                    assert.strictEqual(me.notificationsUnread, 1);
                    assert.strictEqual(me.notificationsLastRead, undefined);

                    ActivityTestsUtil.markNotificationsAsRead(simong.restContext, result => {
                      const { lastReadTime } = result;
                      assert.strictEqual(lastReadTime, OaeUtil.getNumberParam(lastReadTime));

                      // Verify the notificationsLastRead status
                      RestAPI.User.getMe(simong.restContext, (err, me) => {
                        assert.ok(!err);

                        // We now have no unread notifications, and a lastRead status
                        assert.strictEqual(me.notificationsUnread, 0);
                        assert.strictEqual(me.notificationsLastRead, lastReadTime);

                        // Create 2 content items again with simong as a member so we can assert the aggregation has been reset
                        RestAPI.Content.createLink(
                          mrvisser.restContext,
                          'Google',
                          'Google',
                          'private',
                          'http://www.google.ca',
                          [],
                          [simong.user.id],
                          [],
                          (err, secondContentObj) => {
                            assert.ok(!err);

                            RestAPI.Content.createLink(
                              mrvisser.restContext,
                              'Google',
                              'Google',
                              'private',
                              'http://www.google.ca',
                              [],
                              [simong.user.id],
                              [],
                              (err, thirdContentObj) => {
                                assert.ok(!err);

                                // Ensure the notifications get delivered but don't aggregate with the older "marked as read" item
                                ActivityTestsUtil.collectAndGetNotificationStream(
                                  simong.restContext,
                                  null,
                                  (err, notificationStream) => {
                                    assert.ok(!err);
                                    assert.strictEqual(notificationStream.items.length, 2);
                                    ActivityTestsUtil.assertActivity(
                                      notificationStream.items[0],
                                      'content-create',
                                      'create',
                                      mrvisser.user.id,
                                      [secondContentObj.id, thirdContentObj.id],
                                      simong.user.id
                                    );
                                    ActivityTestsUtil.assertActivity(
                                      notificationStream.items[1],
                                      'content-create',
                                      'create',
                                      mrvisser.user.id,
                                      firstContentObj.id,
                                      simong.user.id
                                    );

                                    // Verify the notificationsUnread is incremented and notificationsLastRead status
                                    RestAPI.User.getMe(simong.restContext, (err, me) => {
                                      assert.ok(!err);

                                      // We now have unread notifications, and a lastRead status
                                      assert.strictEqual(me.notificationsUnread, 1);
                                      assert.strictEqual(me.notificationsLastRead, lastReadTime);

                                      // Generate 2 disjoint activities that do not aggregate but both generate a notification. The unread
                                      // count should increment by 2
                                      ActivityTestsUtil.markNotificationsAsRead(
                                        simong.restContext,
                                        result => {
                                          RestAPI.Content.createLink(
                                            mrvisser.restContext,
                                            'Google',
                                            'Google',
                                            'private',
                                            'http://www.google.ca',
                                            [],
                                            [simong.user.id],
                                            [],
                                            (err, fourthContentObj) => {
                                              assert.ok(!err);

                                              RestAPI.Discussions.createDiscussion(
                                                mrvisser.restContext,
                                                'Google',
                                                'Google',
                                                'private',
                                                [],
                                                [simong.user.id],
                                                (err, discussion) => {
                                                  assert.ok(!err);

                                                  // Ensure the notifications get delivered but don't aggregate with the older "marked as read" item
                                                  ActivityTestsUtil.collectAndGetNotificationStream(
                                                    simong.restContext,
                                                    null,
                                                    (err, notificationStream) => {
                                                      assert.ok(!err);
                                                      assert.strictEqual(
                                                        notificationStream.items.length,
                                                        4
                                                      );
                                                      ActivityTestsUtil.assertActivity(
                                                        notificationStream.items[0],
                                                        'discussion-create',
                                                        'create',
                                                        mrvisser.user.id,
                                                        discussion.id
                                                      );
                                                      ActivityTestsUtil.assertActivity(
                                                        notificationStream.items[1],
                                                        'content-create',
                                                        'create',
                                                        mrvisser.user.id,
                                                        fourthContentObj.id,
                                                        simong.user.id
                                                      );

                                                      // Verify the unread notifications has incremented
                                                      RestAPI.User.getMe(
                                                        simong.restContext,
                                                        (err, me) => {
                                                          assert.ok(!err);

                                                          // We now have 2 unread notifications
                                                          assert.strictEqual(
                                                            me.notificationsUnread,
                                                            2
                                                          );

                                                          return callback();
                                                        }
                                                      );
                                                    }
                                                  );
                                                }
                                              );
                                            }
                                          );
                                        }
                                      );
                                    });
                                  }
                                );
                              }
                            );
                          }
                        );
                      });
                    });
                  });
                }
              );
            }
          );
        });
      });
    });
  });

  describe('Mail deduplication', () => {
    /*!
     * Flush the mail queue so other tests don't impact the mail deduplication tests
     */
    beforeEach(EmailTestsUtil.clearEmailCollections);

    /**
     * Test that verifies that when the activity router gets stuck and keeps reprocessing
     * the same activity feed, we don't generate emails for each one
     */
    it('verify mails for the same activity and the same user are only sent once', callback => {
      TestsUtil.generateTestUsers(
        camAdminRestContext,
        3,
        (err, createdUsers, simong, mrvisser, nico) => {
          assert.ok(!err);

          // Give mrvisser and nico an email address
          RestAPI.User.updateUser(
            mrvisser.restContext,
            mrvisser.user.id,
            { emailPreference: 'immediate' },
            err => {
              assert.ok(!err);
              RestAPI.User.updateUser(
                nico.restContext,
                nico.user.id,
                { emailPreference: 'immediate' },
                err => {
                  assert.ok(!err);

                  // Create a piece of content and make nico and mrvisser managers. They should each get an e-mail
                  RestAPI.Content.createLink(
                    simong.restContext,
                    'Yahoo!',
                    'Yahoo!',
                    'public',
                    'http://www.yahoo.com',
                    [mrvisser.user.id, nico.user.id],
                    [],
                    [],
                    (err, link) => {
                      assert.ok(!err);

                      // Assert that both nico and mrvisser received an e-mail, but noone else
                      EmailTestsUtil.collectAndFetchAllEmails(messages => {
                        assert.strictEqual(messages.length, 2);
                        assert.ok(
                          _.contains(
                            [mrvisser.user.email, nico.user.email],
                            messages[0].to[0].address
                          )
                        );
                        assert.ok(
                          _.contains(
                            [mrvisser.user.email, nico.user.email],
                            messages[1].to[0].address
                          )
                        );
                        assert.notStrictEqual(messages[0].to, messages[1].to);

                        // Simulate an unexpected loop and try to route the same activity seed multiple times
                        const actorResource = new ActivityModel.ActivitySeedResource(
                          'user',
                          simong.user.id
                        );
                        const objectResource = new ActivityModel.ActivitySeedResource(
                          'content',
                          link.id
                        );
                        const seed = new ActivityModel.ActivitySeed(
                          ContentConstants.activity.ACTIVITY_CONTENT_UPDATE,
                          Date.now(),
                          ActivityConstants.verbs.UPDATE,
                          actorResource,
                          objectResource
                        );
                        ActivityRouter.routeActivity(seed, err => {
                          assert.ok(!err);
                          ActivityRouter.routeActivity(seed, err => {
                            assert.ok(!err);
                            ActivityRouter.routeActivity(seed, err => {
                              assert.ok(!err);

                              // Assert that only 1 mail got sent to both nico and mrvisser
                              EmailTestsUtil.collectAndFetchAllEmails(messages => {
                                assert.strictEqual(messages.length, 2);
                                assert.ok(
                                  _.contains(
                                    [mrvisser.user.email, nico.user.email],
                                    messages[0].to[0].address
                                  )
                                );
                                assert.ok(
                                  _.contains(
                                    [mrvisser.user.email, nico.user.email],
                                    messages[1].to[0].address
                                  )
                                );
                                assert.notStrictEqual(messages[0].to, messages[1].to[0].address);
                                return callback();
                              });
                            });
                          });
                        });
                      });
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  });
});
