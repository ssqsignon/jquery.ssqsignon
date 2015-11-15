# jquery.ssqsignon
SSQ signon authorization helper for jQuery.

## Requirements

  - [jQuery](https://jquery.com/)
  - A web browser with [HTML5 local storage](http://www.w3schools.com/html/html5_webstorage.asp) support.

## Installation

### Get the file

    <!-- Reference or download latest version -->
    <script src="//rawgit.com/ssqsignon/jquery.ssqsignon/1.0.5/jquery.ssqsignon.js"></script>

## Usage

### Initialze the authentication helper

with your *SSQ signon* module name and client Id.

    $(document).ready(function() {
    
        var authenticator = $.authenticator('your-module-name', 1234);
    });
    
### Log in with a username and password

and store the access and refresh tokens.

    authenticator.login($('#username').val(), $('#password').val())
        .then(function(me) {
            alert('Yay, I'm logged in!');
        }, function() {
            alert('Oops, somethig went wrong. Check username and password.');
        });
    
### Get the current user

based on the stored access token

    authenticator.whoAmI()
        .then(function(me) {
            alert('User Id: ' + me.userId + ' scope: ' + me.scope);  
        }, function(err) {
            return err == 'ask-user' ? login() : err;
        });
    
### Log out

or literally, discard the stored access and refresh tokens

    authenticator.forgetMe()
        .then(function() {
            alert('You were logged out.');
        });
    
### Automatically handle the access token

Automatically append the stored access token to all AJAX requests

    var authenticator = $.authenticator('your-module-name', 1234)
        .autoAppendAccessToken();
    
### Automatically handle the refresh token

If an AJAX request failed with a HTTP status of `401` (i.e. likely due to an expired access token), automatically swap
the stored refresh token for a new access token (and a new refresh token), and repeat the request.

    var authenticator = $.authenticator('your-module-name', 1234)
        .autoRefreshAccessToken();

### Single Sign On (master web app)

#### Safely redirect back to the slave app with the user's authorization code

    $.Deferred(function askAboutAccess(def) { ... })
      .then(function(denyAccess) {
        authenticator.ssoMaster.safeRedirect(denyAccess);
      });

### Single Sign On (slave web app)

#### Redirect to the master app for log in

    authenticator.ssoSlave.loginWithMaster('http://my-sso-master-app.com', 'my requested scope', 'my-state', 'http://my-callback-uri');
    
#### Comsume the authorization (or error) code after redirection from the master app.

    if (queryString('code') && queryString('state')) {
        return authenticator.ssoSlave.consumeAuthorizationCode(queryString('code'), 'http://my-callback-uri')
            .then(function(me) {
                clearQueryString();
                return me;
            });
    } else if (queryString('error')) {
        clearQueryString();
        return $.when('access-denied');
    }
    
#### Configure the authentication helper to work with a token endpoint proxy
        
    var authenticator = $.authenticator('your-module-name', 1234, '/my-auth-proxy-url');
        
## Documentation

### global methods

#### `$.authenticator(useModule, useClient, useAuthProxyUrl, customStore, customAPIEndpoint)`

Initializes and returns `authenticator` (the authentication helper).

- Arguments:
    - `useModule` (text) - the module name to use when querying *SSQ signon*.
    - `useClient` (int) - the client id to use when querying *SSQ signon*.
    - `useAuthProxyUrl` (url) - the URL address to use in case *SSQ signon's* token endpoint should be queried through a proxy.
    - `customStore` (object) - An interface to use for storing access tokens instead of the browser's local storage. The passed object should expose three methods:
        - `set(name, value)` - store a value under *name*.
        - `get(name)` - returns the value stored under *name*.
        - `remove(name)` - clear the value stored under *name*.
    - `customAPIendpoint` (url) - the URL address to use in case all requests to *SSQ signon* should be directed through a proxy.

### `authenticator` methods

#### `whoAmI()`

Returns a promise that resolves either to the user identity and scope contained in the stored access token, or an error code.

- Promise resolved return value
    - `{ userId: 'my-current-user-id', scope: 'my current scope' }` - a valid access token was obtained and contained the following user identity
- Promise rejected return value
    - `'ask-user'` - a valid access token could not be obtained. Ask the user to log in.
    - all others: an unexpected error has occurred.
    
##### How It works

The `whoAmI` method will check whether an access token has already been stored in the storage used by the authentication helper.
If so, it will validate the token with *SSQ signon's* [token validation endpoint](https://ssqsignon.com/home/docs.html#tokenvalidationendpoint), and if the token is valid, return the identity inside the token
that was provided by the [token validation endpoint](https://ssqsignon.com/home/docs.html#tokenvalidationendpoint). If no token is stored, or the stored token turns out invalid, an attempt will
be made to retrieve a stored refresh token, and swap it for a new access token with *SSQ singon's* [token endpoint](https://ssqsignon.com/home/docs.html#tokenendpoint). If that fails, obtaining a valid access token requires
user input (via e.g. a login dialog or Single Sign On redirect), thus the special 'ask-user' error code is returned.

#### `whoAmIAgain(requestSettings)`

Returns a promise which tries to obtain a new access token using a stored refresh token, and when given a request configuration
fires the request after an access token was successfully obtained.
Use this after a request has failed due to an invalid access token to seamlessly get a new access token and repeat the request.
Used when the `autoRefreshAccessToken()` method was called on the authentication helper.

- Arguments
    - `requestSettings` ([request settings object](http://api.jquery.com/jquery.ajax/#jQuery-ajax-settings)) - If not null, `whoAmIAgain` will repeat the request
        with the newly obtained access token, and return a promise of that request.
- Promise resolved return value
    - Either `undefined` or a result of `request` 
- Promise rejected return value
    - `'ask-user'` - a valid access token could not be obtained. Ask the user to log in.
    - all others: an unexpected error has occurred, or `request` has failed.
    
##### How It works

The `whoAmIAgain` will make an attempt to retrieve a stored refresh token, and swap it for a new access token with *SSQ singon's* [token endpoint](https://ssqsignon.com/home/docs.html#tokenendpoint). 
If that fails, obtaining a valid access token requires user input (via e.g. a login dialog or Single Sign On redirect),
thus the special 'ask-user' error code is returned.
The authentication helper uses this method to try and refresh the access token every time an AJAX request
returns a `401` error code when it's `autoRefreshAccessToken()` method was called.

The other typical use case would be to obtain a new access with a proper scope once the user has changed his/her own permission level. 

#### `forgetMe(keepRefreshToken)`

Returns a promise that clears the currently stored access token and (optionally) refresh token.

- Arguments
    - `keepRefreshToken` - when set to `true`, only the current access token will be cleared.
- Promise resolved return value
    - none 
- Promise rejected return value
    - An unexpected error has occurred.
       
#### `accessToken()`

Returns the current access token.

#### `ssoMaster.safeRedirect(denyAccess)`

Returns a promise that will obtain a *safe redirect URI* from *SSQ signon*, and redirect the browser window to that URI.
This method assumes that the URL address in the browser window contains a query string compliant with the [OAuth 2.0
authorization endpoint specification](http://tools.ietf.org/html/rfc6749#section-4.1.1), i.e. `client_id`, `redirect_uri`, `scope` and `state` parameters.
The `response_type` parameter is not required, it will be set to `code` by default.

- Arguments
    - `denyAccess` - When set to `true`, the user will be denied access after the redirection.
- Promise resolved return value
    - The safe redirect URI.
- Promise rejected return value
    - An unexpected error has occurred.
    
##### How it works

The `safeRedirect` method will try to validate the requested redirection, and obtain a safe redirect URI from *SSQ signon's* [redirect validation endpoint](https://ssqsignon.com/home/docs.html#redirectvalidationendpoint).
The request will require the `client_id`, `redirect_uri`, `scope` and `state` parameters, which `safeRedirect` will attempt to get
from the query string of the current window's URL. The current access token will also be passed to generate an authorization code
that will transfer the user's identity in the redirect URI. If the [redirect validation endpoint](https://ssqsignon.com/home/docs.html#redirectvalidationendpoint) validates the redirection request
as safe, the safe redirect URI will be returned, which `safeRedirect` will immediately use to redirect the browser window to the other app.

The `denyAccess` parameter can be set to `true` to still redirect to the other app, but explicitly state that the user has denied access
while signing in with the SSO master app.

#### `ssoSlave.loginWithMaster(masterUri, scope, state, callbackUri)`

Will redirect the browser window to a SSO master app URI, with a query string compliant with the [OAuth 2.0 authorization endpoint
specification](http://tools.ietf.org/html/rfc6749#section-4.1.1) (the `response_type` parameter is not required).
This query string can be processed by `ssoMaster.safeRedirect(denyAccess)` after redirection. 

- Arguments
    - `masterUri` - The URI to the SSO master app.
    - `scope` - The requested scope.
    - `state` - Any string that you need to carry over with the redirection. If nothing else, set this to a randomly generated value
        and the verify it before calling `ssoSlave.consumeAuthorizationCode(code, redirectUri)` for extra security.
    - `callbackUri` - The URI that the SSO master app should redirect to after log in. Typically you will set to some URI pointing to
        your SSO slave app.

#### `ssoSlave.consumeAuthorizationCode(code, redirectUri)`

Returns a promise that will swap the authorization code received with the SSO redirect for an access token using *SSQ signon's* [token endpoint](https://ssqsignon.com/home/docs.html#tokenendpoint),
and return the user identity and scope inside the obtained token.
Since swapping an authorization code for an access token requires the *client secret*, the authorization helper should query a proxy that
will append it to the request, rather than the *SSQ singon* token endpoint directly.

- Arguments
    - `code` -  The authorization code extracted from the request
    - `redirect URI` - The redirect URI passed to the master SSO app, for verification.
- Promise resolved return value
    - `{ userId: 'my-current-user-id', scope: 'my current scope' }` - a valid access token was obtained and contained the following user identity
- Promise rejected return value
    - `'ask-user'` - a valid access token could not be obtained. Ask the user to log in again.
    - all others: an unexpected error has occurred.
    
##### How it works

The `consumeAuthorizationCode` method will try to swap the authorization code passed along in the safe redirect URI
for an access token using *SSQ signon's* [token endpoint](https://ssqsignon.com/home/docs.html#tokenendpoint). If succeeded
the access (and possibly refresh) token will be stored, and the user's identity returned.

Please note that using the [token endpoint](https://ssqsignon.com/home/docs.html#tokenendpoint) requires a client secret to swap an authorization code
for an access token. The client secret (as the name implies) cannot be visible to the public (yes, hardcoded in javascript counts as visible to the public),
so your server will have to proxy the request to the [token endpoint](https://ssqsignon.com/home/docs.html#tokenendpoint)
and append the client credential as needed.

### `login(username, password)`

Returns a promise that will swap the username and password for an access token, and return the user identity and scope inside the obtained token.

- Arguments
    - `username` -  The username.
    - `password` - The password.
- Promise resolved return value
    - `{ userId: 'my-current-user-id', scope: 'my current scope' }` - a valid access token was obtained and contained the following user identity.
- Promise rejected return value
    - An unexpected error has occurred.
    
#### How it works

The `login` method will try to swap a username and password for an access token using *SSQ signon's* [token endpoint](https://ssqsignon.com/home/docs.html#tokenendpoint).
If succeeded, the access (and possibly refresh) token will be stored, and the user's identity returned.

## Examples

For a complete, working example, refer to the [SSQ signon examples](https://github.com/ssqsignon/ssqsignon-examples) repository.

For an online demo go to [SSQ signon demos](https://ssqsignon.com/home/demos.html)

## Related modules

  - [jQuery](https://jquery.com/)
  - [SSQ signon authproxy](https://github.com/ssqsignon/ssqsignon-authproxy)

## Credits

  - [Riviera Solutions](https://github.com/rivierasolutions)

## License

[The MIT License](http://opensource.org/licenses/MIT)

Copyright (c) 2015 Riviera Solutions Piotr Wójcik <[http://rivierasoltions.pl](http://rivierasolutions.pl)>
