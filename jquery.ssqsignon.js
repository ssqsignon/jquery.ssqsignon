(function($) {

    $.authenticator = function (useModule, useClient, useAuthProxyUrl, customStore, customAPIEndpoint) {
        var module = useModule,
            client = useClient,
            store = localStore(),
            authUrl = null,
            apiEndpoint = 'https://ssqsignon.com',
            whoAmIPromise = null,
            refreshAccessTokenPromise = null;
        if (customStore) {
            store = customStore;
        } else if (typeof(Storage) === "undefined") {
            console.log('Your browser does not support local storage. Please upgrade your browser and proceed.');
        }
        if (customAPIEndpoint) {
            apiEndpoint = customAPIEndpoint;
        }
        authUrl = useAuthProxyUrl ? useAuthProxyUrl : [ apiEndpoint, module, 'auth' ].join('/');

        return {
            whoAmI: function() {
                if (!whoAmIPromise) {
                    whoAmIPromise = (accessToken() ? askWhoAmI().then(null, getNewAccessToken) : getNewAccessToken())
                        .then(function(data) {
                            whoAmIPromise = null;
                            return data;
                        });
                }
                return whoAmIPromise;
            },

            whoAmIAgain: function(request) {
                return askWhoAmIAgain(request);
            },

            forgetMe: function (keepRefreshToken) {
                return $.when(clearTokens(keepRefreshToken));
            },

            ssoMaster: {
                safeRedirect: function(denyAccess) {
                    return $.Deferred(function(def) {
                        $.ajax([ apiEndpoint, module, 'saferedirect' ].join('/'), { data: { response_type: 'code', client_id: $location.search().client_id, redirect_uri: $location.search().redirect_uri, scope: $location.search().scope, state: $location.search().state, deny_access: denyAccess }, headers: { Authorization: ['bearer', accessToken()].join(' ') } })
                            .success(function(data) {
                                def.resolve(data.redirect_uri);
                            })
                            .error(function (data, status) {
                                def.reject({ data: data, status: status });
                            });
                    })
                        .then(function(redirectUri) {
                            if (window) {
                                window.location.assign(redirectUri);
                            }
                            return redirectUri;
                        });
                }
            },

            ssoSlave: {
                loginWithMaster: function(masterUri, scope, state, callbackUri) {
                    window.location.assign([masterUri, '?client_id=', encodeURI(client), '&redirect_uri=', encodeURI(callbackUri), '&scope=', encodeURI(scope), '&state=', encodeURI(state) ].join(''));
                },

                consumeAuthorizationCode: function(code, redirectUri) {
                    return $.Deferred(function (def) {
                        $.post(authUrl, { client_id: client, grant_type: 'authorization_code', redirect_uri: redirectUri, code: code })
                            .success(function (data) {
                                def.resolve({ userId: data.user_id, scope: data.scope, accessToken: data.access_token, refreshToken: data.refresh_token });
                            })
                            .error(function (data, status) {
                                def.reject({ data: data, status: status });
                            });
                    })
                        .then(function(accessInfo) {
                            storeTokens(accessInfo);
                            return whoAmI();
                        });
                }
            },

            login: function(username, password) {
                return $.Deferred(function(def) {
                    $.post(authUrl, { client_id: client, grant_type: 'password', username: username, password: password })
                        .success(function(data) {
                            def.resolve({ userId: data.user_id, scope: data.scope, accessToken: data.access_token, refreshToken: data.refresh_token });
                        })
                        .error(function (data, status) {
                            def.reject({ data: data, status: status });
                        });
                })
                    .then(function(data) {
                        storeTokens(data);
                        return { userId: data.userId, scope: data.scope };
                    });
            },

            autoAppendAccessToken:  function() {
                setupAppendAccessToken();
                return this;
            },

            autoRefreshAccessToken: function() {
                setupRefreshAccessToken();
                return this;
            }
        };

        function askWhoAmI() {
            return $.Deferred(function(def) {
                $.ajax([ apiEndpoint, module, 'whoami' ].join('/'), { headers: { Authorization: ['bearer', accessToken()].join(' ') } })
                    .success(function(data) {
                        def.resolve({ userId: data.user_id, scope: data.scope });
                    })
                    .error(function (data, status) {
                        def.reject({ data: data, status: status });
                    });
            });
        }

        function getNewAccessToken() {
            if (!refreshAccessTokenPromise) {
                refreshAccessTokenPromise = (refreshToken() ? refresh().then(storeTokens, askUser) : askUser())
                    .then(function(data) {
                        refreshAccessTokenPromise = null;
                        return data;
                    });
            }
            return refreshAccessTokenPromise;
        }

        function refresh() {
            return $.Deferred(function (def) {
                $.post(authUrl, { client_id: client, grant_type: 'refresh_token', refresh_token: store.get('refresh_token') })
                    .success(function (data) {
                        def.resolve({ userId: data.user_id, scope: data.scope, accessToken: data.access_token, refreshToken: data.refresh_token });
                    })
                    .error(function () {
                        def.reject();
                    });
            });
        }

        function askUser() {
            return $.Deferred().reject('ask-user');
        }

        function storeTokens(authorisationResult) {
            store.set('access_token', authorisationResult.accessToken);
            store.set('refresh_token', authorisationResult.refreshToken);
            return authorisationResult;
        }

        function clearTokens(keepRefreshToken) {
            store.remove('access_token');
            if (!keepRefreshToken) {
                store.remove('refresh_token');
            }
        }

        function accessToken() {
            return store.get('access_token');
        }

        function refreshToken() {
            return store.get('refresh_token');
        }

        function localStore() {
            return  {
                get: function(name) {
                    return localStorage.getItem(name.toString());
                },
                set: function(name, item) {
                    localStorage.setItem(name.toString(), item.toString());
                },
                remove: function(name) {
                    localStorage.removeItem(name.toString());
                }
            };
        }

        function askWhoAmIAgain(request) {
            return getNewAccessToken()
                .then(function() {
                    return request ? $.ajax(request) : $.when();
                });
        }

        function setupRefreshAccessToken() {
            $(document).ajaxError(function(ev, res, config, error) {
                if (res.status == 401 && wasNotWhoAmIRequest(config)) {
                    return askWhoAmIAgain(config);
                }
            });

            function wasNotWhoAmIRequest(request) {
                return request.url.search('whoami') == -1
            }
        }

        function setupAppendAccessToken() {
            $(document).ajaxSend(function(ev, req, config) {
                var token = accessToken();
                if (token && isNotAuthRequest(config)) {
                    req.setRequestHeader('Authorization', [ 'Bearer', token ].join(' '));
                }
                return config;
            });

            function isNotAuthRequest(config) {
                return config.url.search('auth') == -1;
            }
        }
    }

})(jQuery);
