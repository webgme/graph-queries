/*globals define*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

var Q = require('q'),
    maps = requireJS('plugin/GraphDBExporter/GraphDBExporter/maps'),
    superagent = require('superagent');

function Query(baseUrl, username, password) {
    var basicAuth = 'Basic ' + new Buffer(username + ':' + password).toString('base64');

    // http://localhost:2480/command/guest-FSM-master/gremlin/-/20
    // Basic auth
    // body: {"command": "g.V.has('path', '/1')", "mode": "graph"}
    function getUrl(dbName, limit) {
        return [
            baseUrl,
            'command',
            dbName,
            'gremlin',
            '-',
            limit
        ].join('/');
    }

    this.sendCommand = function (ownerId, projectName, branchOrCommitHash, command, limit) {
        var deferred = Q.defer(),
            dbName = maps.getDBNameFromOwnerAndProjectName(ownerId, projectName, branchOrCommitHash),
            url = getUrl(dbName, limit || 20);

        if (!command) {
            deferred.reject(new Error('command not supplied in body'));
            return deferred.promise;
        }

        console.log('Posting', url);
        console.log('With command', command);
        superagent.post(url)
            .set('Authorization', basicAuth)
            .send({
                command: command,
                mode: 'graph'
            })
            .end(function (err, res) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve(res.body);
                }
            });

        return deferred.promise;
    }
}

module.exports = Query;
