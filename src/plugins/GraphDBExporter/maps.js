/*globals define*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */
define(['common/storage/constants'], function(STORAGE_CONSTANTS) {

    var CONSTANTS = {
        DB_NAME_SEP: '-',
        //FIXME: What are the reserved keywords and how should they be dealt with??
        ILLEGAL_ATTR: ['relid', 'path', 'guid', '@rid', '@class'],
        PREFIX_ILLEGAL_ATTR: '_'
    };

    function _trimCommit(branchOrCommitHash) {
        return branchOrCommitHash.indexOf('#') === 0 ? branchOrCommitHash.substring(1) : branchOrCommitHash
    }

    function getDBNameFromProjectId(projectId, branchOrCommitHash) {
        var arr = projectId.split(STORAGE_CONSTANTS.PROJECT_ID_SEP);

        arr.push(_trimCommit(branchOrCommitHash));

        return arr.join(CONSTANTS.DB_NAME_SEP);
    }

    function getDBNameFromOwnerAndProjectName(ownerId, projectName, branchOrCommitHash) {
        return [ownerId, projectName, _trimCommit(branchOrCommitHash)].join(CONSTANTS.DB_NAME_SEP);
    }

    return {
        getDBNameFromProjectId: getDBNameFromProjectId,
        getDBNameFromOwnerAndProjectName: getDBNameFromOwnerAndProjectName,
        CONSTANTS: CONSTANTS
    }
});