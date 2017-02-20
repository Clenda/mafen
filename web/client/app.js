'use strict';

require('bootstrap/dist/css/bootstrap.min.css');
require('./ribbons.css');
require('./hue.css');
require('./app.css');

require('angular');
require('angular-route');
require('angular-ui-bootstrap/dist/ui-bootstrap-tpls.js');
require('alertify.js/dist/js/ngAlertify.js');
var jsSHA256 = require('js-sha256/build/sha256.min.js');

var app = angular.module('app', ['ngAlertify', 'ngRoute', 'ui.bootstrap'])
.service('mafenSession', function($rootScope, $uibModal, alertify, $timeout) {
  'ngInject';

  var that = this;

  this.reset = function() {
    that.loggedIn = false;
    that.characters = [];
    that.items = [];
    that.meters = {};
    that.attrs = {};
  };

  var onmessage = function(message) {
    var msg = JSON.parse(message.data);

    if (msg.action === 'connect') {
      if (msg.success) {
        $uibModal.open({
          ariaLabelledBy: 'charlist-modal-title',
          ariaDescribedBy: 'charlist-modal-body',
          templateUrl: 'charlist.html',
          controller: 'CharacterListModalCtrl'
        });
        that.loggedIn = true;
      } else {
        alertify.error('Authentication failed');
      }
    } else if (msg.action === 'character') {
      that.characters.push(msg.name);
    } else if (msg.action === 'item') {
      that.items.push(msg);
    } else if (msg.action === 'destroy') {
      that.items = that.items.filter(function(item) {
        return item.id !== msg.id;
      });
      delete that.meters[msg.id];
    } else if (msg.action === 'attr') {
      that.attrs = msg.attrs;
    } else if (msg.action === 'meter') {
      that.meters[msg.id] = msg.meter;
    } else {
      // TODO
    }
    $rootScope.$apply();
  };

  this.waitForConnection = function(callback, interval) {
    if (that.ws.readyState === 1) { // OPEN
      callback();
    } else {
      $timeout(function() {
        that.waitForConnection(callback, interval);
      }, interval);
    }
  };

  this.connect = function(addr) {
    that.ws = new WebSocket(addr);
    that.ws.onmessage = onmessage;
  };

  this.send = function(data) {
    // To avoid "Error: Failed to execute 'send' on 'WebSocket': Still in CONNECTING state"
    that.waitForConnection(function() {
      that.ws.send(JSON.stringify(data));
    }, 1000);
  };

  this.close = function() {
    that.ws.close();
  };

  this.getTotalMW = function() {
    var total = 0;
    for (var i = 0; i < that.items.length; ++i) {
      var item = that.items[i];
      if (item.info.curio && item.study) {
        total += item.info.mw;
      }
    }
    return total;
  };

  this.getProgress = function(id) {
    var progress = '';
    for (var i = 0; i < that.items.length; ++i) {
      var item = that.items[i];
      if (item.id === id) {
        var meter = that.meters[id];
        if (meter !== undefined) {
          progress = meter + '%';
        }
        break;
      }
    }
    return progress;
  };
})
.config(function($routeProvider, $locationProvider) {
  'ngInject';

  var checkLoggedin = function($q, $location, mafenSession) {
    'ngInject';

    // TODO: remove defer
    var deferred = $q.defer();

    if (mafenSession.loggedIn) {
      deferred.resolve();
    } else {
      deferred.reject();
      $location.url('/login');
    }

    return deferred.promise;
  };

  $routeProvider
    .when('/', {
      templateUrl: 'main.html',
      controller: 'MainCtrl',
      resolve: {
        loggedin: checkLoggedin
      }
    })
    .when('/login', {
      templateUrl: 'login.html',
      controller: 'LoginCtrl'
    })
    .otherwise({
      redirectTo: '/'
    });
})
.run(function($rootScope, $location, mafenSession) {
  'ngInject';

  $rootScope.logout = function() {
    mafenSession.close();
    mafenSession.loggedIn = false;
    $location.url('/login');
  };
});

app.controller('LoginCtrl', function($scope, mafenSession) {
  'ngInject';

  $scope.mafenSession = mafenSession;
  $scope.mafenSession.reset();

  $scope.user = {};

  $scope.login = function() {
    $scope.mafenSession.connect('ws://127.0.0.1:8000');
    $scope.mafenSession.send({
      action: 'connect',
      data: {
        username: $scope.user.username,
        password: jsSHA256.sha256($scope.user.password)
      }
    });
  };
});

app.controller('MainCtrl', function($scope, mafenSession) {
  'ngInject';

  $scope.mafenSession = mafenSession;

  $scope.transferItem = function(id) {
    $scope.mafenSession.send({
      action: 'transfer',
      data: {
        id: id
      }
    });
  };

  $scope.minutesToHoursMinutes = function(totalMins) {
    var hours = Math.floor(totalMins / 60);
    var minutes = totalMins % 60;
    return hours + ':' + parseInt(minutes, 10);
  };
});

app.controller('CharacterListModalCtrl', function($scope, $location, $uibModalInstance, mafenSession) {
  'ngInject';

  $scope.mafenSession = mafenSession;

  $scope.chooseCharacter = function(character) {
    $scope.mafenSession.send({
      action: 'play',
      data: {
        char_name: character
      }
    });
    $scope.close();
    $location.url('/');
  };

  $scope.close = function() {
    $uibModalInstance.dismiss('cancel');
  };
});
