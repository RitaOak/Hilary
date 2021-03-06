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

import * as OAE from 'oae-util/lib/oae';
import * as TelemetryAPI from './api';

/**
 * @REST getTelemetry
 *
 * Get all collected cluster-wide telemetry data since the latest telemetry reset
 *
 * @Server      admin
 * @Method      GET
 * @Path        /telemetry
 * @Return      {Telemetry}                  All cluster-wide telemetry data since last reset
 * @HttpResponse                200          Telemetry available
 * @HttpResponse                401          Only global administrators are allowed to retrieve telemetry data
 */
OAE.globalAdminRouter.on('get', '/api/telemetry', function(req, res) {
  if (req.ctx.user() && req.ctx.user().isGlobalAdmin()) {
    TelemetryAPI.getTelemetryData(function(err, data) {
      if (err) {
        return res.status(err.code).send(err.msg);
      }

      res.status(200).send(data);
    });
  } else {
    return res.status(401).send('Only global administrators are allowed to retrieve telemetry data');
  }
});
