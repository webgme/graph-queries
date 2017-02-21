/*globals define*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

var Q = require('q'),
    maps = requirejs('plugin/GraphDBExporter/GraphDBExporter/maps'),
    superagent = require('superagent');

function Query(baseUrl, username, password) {
    var basicAuth = 'Basic ' + new Buffer(username + ':' + password).toString('base64');

    function getUrl(dbName, limit) {
        return [
            baseUrl,
            'command',
            dbName,
            '-',
            limit || 20
        ].join('/');
    }

    this.sendCommand = function (ownerId, projectName, branchOrCommitHash, command, limit) {
        var deferred = Q.defer(),
            dbName = maps.getDBNameFromOwnerAndProjectName(ownerId, projectName, branchOrCommitHash);

        superagent.post(getUrl(dbName, limit))
            .set('Authorization', basicAuth)
            .send({
                command: command,
                mode: 'graph'
            })
            .end(function (err, res) {
                if (err) {
                    console.log('res at error:', res);
                    deferred.reject(err);
                } else {
                    deferred.resolve(res);
                }
            });

        return deferred.promise();
    }
}

module.exports = Query;
