/*
 * CDDL HEADER START
 * this is a simple module for node connect openam restful JSON-based APIs
 * example:
 *   var OpenAm = require('openam').OpenAm,
 *       _openam = new OpenAm(openAmBaseUrl, openAmRealm, openAmCookieName);
 * CDDL HEADER END
 *
 *
 * Copyright (c) 2016, Nanchang Hudao Technology Co., Ltd. All rights reserved.
 *
 */

/*
 *
 *  https://github.com/honwlee/node-openam-rest.git
 * code is lisenced under MIT, see LICENSE.MIT.
 *
 */


var querystring = require('querystring'),
    request = require('request'),
    URL = require('url');

/**
 * `OpenAM` constructor.
 *
 *  Options:
 *    - `baseSite`   URL used for your OpenAM environment ex: https://www.example.com/openam/
 */
exports.OpenAm = function(baseSite) {
    this._baseSite = baseSite;
    // REST API endpoints
    this._endpoints = {
        // General purpose endpoints
        sessions: baseSite + "/json/sessions",
        users: baseSite + "/json/users",
        // Login & Logout
        authenticate: baseSite + "/json/authenticate",
        logout: baseSite + this._endpoints.users + '/?_action=logout',

        // Password Resetting / Changing
        forgotPassword: baseSite + this._endpoints.users + "/?_action=forgotPassword",
        forgotPasswordReset: baseSite + this._endpoints.users + "/?_action=forgotPasswordReset",
        confirm: baseSite + this._endpoints.users + "/?_action=confirm"
    };
}

exports.OpenAm.prototype._request = function(options, callback) {
    var callbackCalled = false,
        _Options = {
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST',
            json: true
        };

    for (var key in options) {
        _Options[key] = options[key];
    }
    request(_Options, function(error, response, body) {
        callback(error, response, body);
    });

}

exports.OpenAm.prototype.authenticate = function(username, password, callback) {
    var self = this;
    process.nextTick(function() {
        self._request({
            headers: {
                'Content-Type': 'application/json',
                'X-OpenAM-Username': username,
                'X-OpenAM-Password': password,
                'Accept-API-Version': 'resource=2.0, protocol=1.0'
            },
            url: self._endpoints.authenticate,
        }, function(error, response, body) {
            if (body) {
                if (body.tokenId) {
                    self.isTokenValid(body.tokenId, function(err, userId) {
                        if (err) {
                            callback(err, null);
                        } else {
                            callback(null, {
                                'id': userId,
                                'tokenId': body.tokenId
                            });
                        }
                    });
                } else {
                    callback(body.message);
                }
            }
        });
    });
}

exports.OpenAm.prototype.logout = function(tokenId, callback) {
    this._request({
        headers: {
            'Content-Type': 'application/json',
            'iplanetDirectoryPro': tokenId
        },
        url: this._endpoints.logout
    }, function(error, response, body) {
        if (body.code && body.code == 401) {
            callback(body);
        }
    });
}

exports.OpenAm.prototype.isTokenValid = function(tokenId, callback) {
    request({
        headers: {
            'Content-Type': 'application/json'
        },
        url: this._endpoints.sessions + "/" + tokenId + "?_action=validate",
    }, function(error, response, body) {
        if (error) {
            console.log(error);
            callback(error, null);
        } else {

            if (body.valid == true) {
                callback(null, body.uid)
            } else {
                callback(new Error('Invalid token'), null);
            }
        }
    });
}


exports.OpenAm.prototype.forgotPassword = function(username, callback) {
    var subject = "Reset your forgotten password.",
        message = "Follow this link to reset your password";
    request({
        url: this._endpoints.forgotPassword,
        body: {
            'username': username,
            'subject': subject,
            'message': message
        }
    }, function(error, response, body) {
        body.code ? callback(body, null) : callback(null, true);
    });
};

exports.OpenAm.prototype.changePassword = function(user, currentPassword, newPassword, callback) {
    this._request({
        headers: {
            'Content-Type': 'application/json',
            'iplanetDirectoryPro': user.tokenId
        },
        url: this._endpoints.users + user.id + '?_action=changePassword',
        body: {
            "currentpassword": currentPassword,
            "userpassword": newPassword
        }
    }, function(error, response, body) {
        body.code ? callback(body, null) : callback(null, true);
    });
};

exports.OpenAm.prototype.forgotPasswordReset = function(data, callback) {
    this._request({
        url: this._endpoints.forgotPasswordReset,
        body: data
    }, function(error, response, body) {
        body.code ? callback(body, null) : callback(null, true);
    });
};

exports.OpenAm.prototype.confirm = function(data, callback) {
    this._request({
        url: this._endpoints.confirm,
        method: "GET",
        body: data
    }, function(error, response, body) {
        body.code ? callback(body, null) : callback(null, body);
    });
};

exports.OpenAm.prototype.authorize = function(token, uri, callback) {
    this._request(this._getAuthorizeUrl(token, uri), function(error, data) {
        if (error) {
            callback(error, false);
            return;
        }
        var results = {};
        if (data) {
            results = querystring.parse(data);
            if (results['boolean'] == 'true') {
                callback(null, true);
            } else {
                callback(null, false);
            }
        } else {
            callback(null, false);
        }
    });

}

exports.OpenAm.prototype.getLoginUiUrl = function(params) {
    return this._baseSite + "XUI/#login";
}

exports.OpenAm.prototype.getAttributes = function(token, callback) {
    this._request({
        url: this._baseSite + "identity/attributes",
        body: {
            subjectid: token
        }
    }, function(error, data) {
        if (error) {
            callback(error, false);
            return;
        }
        var results = {};
        if (data) {
            var attributes = data.split(/\r\n|\r|\n/);
            var retVal = {};
            var lastName = "";
            var tmpValArray = [];
            var tmpVal = "";
            for (var i in attributes) {
                if (attributes[i].match(/token.id/)) {
                    retVal['tokenid'] = attributes[i].split('=')[1];
                    continue;
                }
                if (attributes[i].match(/name/)) {
                    if (tmpValArray.length > 0) {
                        tmpValArray.push(tmpVal);
                        retVal[lastName] = tmpValArray;
                    } else if (tmpVal) {
                        retVal[lastName] = tmpVal;
                    }
                    lastName = attributes[i].split('=')[1];
                    tmpValArray = []
                    tmpVal = "";
                    continue;
                }
                if (attributes[i].match(/value/)) {
                    if (tmpVal != "") {
                        tmpValArray.push(tmpVal);
                        tmpVal = attributes[i].split('=')[1];
                        continue;
                    } else {
                        tmpVal = attributes[i].split('=')[1];
                        continue;
                    }
                }
            }
            if (tmpValArray.length > 0) {
                tmpValArray.push(tmpVal);
                retVal[lastName] = tmpValArray;
            } else {
                retVal[lastName] = tmpVal;
            }
            callback(null, retVal);
        } else {
            callback("No Data", null);
        }
    });
}
