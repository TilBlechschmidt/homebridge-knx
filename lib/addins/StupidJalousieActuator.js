/* jshint esversion: 6, strict: true, node: true */

'use strict';
const HandlerPattern = require('./handlerpattern.js');
const log = require('debug')('StupidJalousieActuator');

/**
 * @class A custom handler for all the stupid blinds actors out there that give no feedback
 * @extends HandlerPattern
 */
class StupidJalousieActuator extends HandlerPattern {
    Direction = {
        Down: 0,
        Up: 1,
        Stopped: 2
    };

    // Speed in millisec / %
    get travelSpeed() {
        const travelTimeMillis = this.myAPI.getLocalConstant("TravelTime") * 1000;
        return travelTimeMillis / 100;
    }

    canBeStopped = false;
    ignoreNextKNXEvent = false;

    onKNXValueChange(field, oldValue, newValue) {
        if (this.ignoreNextKNXEvent) {
            this.ignoreNextKNXEvent = false;
            return;
        }

        const delta = field === 'LongPress' ? 100 : 75;
        const direction = newValue === 0 ? this.Direction.Up : this.Direction.Down;

        // If the thing is on the move and has been sent on its way by a long press handle stopping
        if (this.isMoving && this.canBeStopped && field === 'ShortPress') {
            this.canBeStopped = false;
            this.stopMove();
        } else {
            this.canBeStopped = field === 'LongPress';
            this.processMove(delta, direction);
        }
    }

    onHKValueChange(field, oldValue, newValue) {
        if (field !== 'TargetPosition') return;
        oldValue = this.currentPosition;

        const delta = Math.abs(oldValue - newValue);
        const direction = newValue > oldValue ? this.Direction.Up : this.Direction.Down;
        const knxDirection = direction === this.Direction.Up ? 0 : 1;

        this.ignoreNextKNXEvent = true;
        this.myAPI.knxWrite("LongPress", knxDirection, "DPT1");
        this.processMove(delta, direction, () => {
            if (newValue === 100 || newValue === 0) return;
            this.ignoreNextKNXEvent = true;
            this.myAPI.knxWrite("ShortPress", knxDirection, "DPT1");
        });
    }

    _currentPosition = 0;
    _targetPosition = 0;

    get currentPosition() { return this._currentPosition; }
    set currentPosition(newValue) {
        this._currentPosition = Math.min(Math.max(0, newValue), 100);
        this.myAPI.setValue('CurrentPosition', this.currentPosition);
    }

    get targetPosition() { return this._targetPosition; }
    set targetPosition(newValue) {
        this._targetPosition = Math.min(Math.max(0, newValue), 100);
        this.myAPI.setValue('TargetPosition', this.targetPosition);
    }

    get isMoving() { return this.moveInterval !== undefined; }

    stopMove() {
        if (this.moveInterval) {
            clearInterval(this.moveInterval);
            this.moveInterval = undefined;
        }

        this.myAPI.setValue('PositionState', this.Direction.Stopped);
        this.targetPosition = this.currentPosition;
    }

    processMove(delta, direction, onFinish = () => {}) {
        this.stopMove();

        // TODO Cap the delta to the maximum possible movement in one direction.

        const step = direction === this.Direction.Up ? 1 : -1;
        let steps = delta;

        this.myAPI.setValue('PositionState', direction);
        this.targetPosition = this.currentPosition + delta * step;

        this.moveInterval = setInterval(() => {
            this.currentPosition += step;

            steps -= 1;
            if (steps <= 0) {
                this.stopMove();
                onFinish();
            }
        }, this.travelSpeed);
    }

    onServiceInit() {
        this.currentPosition = 0;
        this.targetPosition = 0;
        this.myAPI.setValue('PositionState', this.Direction.Stopped);
        this.myAPI.knxWrite("LongPress", 1, "DPT1");
    }
}

module.exports=	StupidJalousieActuator;