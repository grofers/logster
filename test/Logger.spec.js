/* eslint-disable no-unused-expressions */
import sinon from 'sinon';
import chai, { expect } from 'chai';

import Logster from '../src/Logger';

const should = chai.should();

const ACTION1 = { type: 'MOCK_ACTION' };
const ACTION2 = { type: 'MOCK_ACTION2' };
const STATE = { key: 'value' };

describe('Logger', () => {
    let clock;

    before(() => { clock = sinon.useFakeTimers(); });

    after(() => clock.restore());

    it('should throw if one of url or __send__ is not provided', () => {
        expect(() => new Logster()).to.throw();
    });

    it('should set defaults correctly', () => {
        const logger = new Logster({ url: '/log' });

        logger.actionFilter(ACTION1).should.be.eql(ACTION1);
        logger.stateFilter(STATE).should.be.eql({});
    });

    it('should not flush if automaticFlush is off', () => {
        const logger = new Logster({ url: '/log', automaticFlush: false, maxBufferLength: 2 });
        logger.flush = sinon.spy();

        logger.report('info', ACTION1, STATE);
        logger.report('info', ACTION2, STATE);

        logger.flush.called.should.be.false;
    });

    it('should flush if automaticFlush is on', () => {
        const logger = new Logster({ url: '/log', automaticFlush: true, maxBufferLength: 2 });
        logger.flush = sinon.spy();

        logger.report('info', ACTION1, STATE);
        logger.report('info', ACTION2, STATE);

        logger.flush.calledOnce.should.be.true;
    });

    it('should overwrite previous logs when overflow', () => {
        const logger = new Logster({ url: '/log', automaticFlush: false, maxBufferLength: 2 });
        const ACTION3 = { type: 'MOCK_ACTION3' };

        logger.report('info', ACTION1, STATE);
        logger.report('info', ACTION2, STATE);
        logger.report('info', ACTION3, STATE);
        const expectedBuffer = [{
            timestamp: Date.now(), // fake time
            extra: {},
            state: {},
            level: 'info',
            action: ACTION2,
        }, {
            timestamp: Date.now(),
            extra: {},
            state: {},
            level: 'info',
            action: ACTION3,
        }];

        logger.buffer.getBuffer().should.be.eql(expectedBuffer);
    });

    it('should flush if given interval has passed', () => {
        const stub = sinon.stub(Logster.prototype, 'flush');
        const logger = new Logster({ url: 'http://mock/log', maxBufferLength: 20, interval: 500 });

        logger.report('info', ACTION1, STATE);
        logger.report('info', ACTION2, STATE);

        clock.tick(600);
        stub.called.should.be.true;
        stub.restore();
    });

    it('should overwrite default flush', () => {
        const __send__ = sinon.spy();
        const logger = new Logster({
            url: 'http://mock/log',
            maxBufferLength: 2,
            sessionIdRequired: false,
            __send__
        });

        logger.report('info', ACTION1, STATE);
        logger.report('info', ACTION2, STATE);

        const expectedLogs = [{
            timestamp: Date.now(), // fake time
            extra: {},
            state: {},
            level: 'info',
            action: ACTION1,
        }, {
            timestamp: Date.now(),
            extra: {},
            state: {},
            level: 'info',
            action: ACTION2,
        }];

        __send__.called.should.be.true;
        __send__.calledWith(expectedLogs).should.be.true;
    });

    it('should return a empty promise if sessionId is required and not set', () => {
        let logger;
        const stub = (() => {
            const originalFlush = Logster.prototype.flush;
            return sinon.stub(Logster.prototype, 'flush').callsFake((...args) => originalFlush.apply(logger, args));
        })();

        logger = new Logster({ url: 'http://mock/log', maxBufferLength: 2, sessionIdRequired: true });

        logger.report('info', ACTION1, STATE);
        logger.report('info', ACTION2, STATE);

        stub.calledOnce.should.be.true;
        stub.firstCall.returnValue.should.be.a('Promise');

        stub.restore();

        return stub.firstCall.returnValue.then((value) => {
            value.should.be.equal('Required sessionId not set');
        });
    });

    it('should fetch if sessionId is set and required', () => {
        const __send__ = sinon.spy();
        const logger = new Logster({
            url: 'http://mock/log',
            maxBufferLength: 2,
            sessionIdRequired: true,
            __send__
        });

        logger.setSessionId('ID');

        logger.report('info', ACTION1, STATE);
        logger.report('info', ACTION2, STATE);

        __send__.called.should.be.true;
        __send__.getCalls()[0].args[1].should.be.equal('ID');
    });

    it('should run all the hooks', () => {
        const spy1 = sinon.spy();
        const spy2 = sinon.spy();
        const logger = new Logster({
            url: 'http://mock/log',
            maxBufferLength: 4,
        });
        logger.addHook(spy1);
        logger.addHook(spy2);

        logger.report('info', ACTION1, STATE);
        logger.report('info', ACTION2, STATE);

        const expectedLogs = [{
            timestamp: Date.now(), // fake time
            extra: {},
            state: {},
            level: 'info',
            action: ACTION1,
        }, {
            timestamp: Date.now(),
            extra: {},
            state: {},
            level: 'info',
            action: ACTION2,
        }];

        logger.setSessionId('ID');
        logger.runHooks();

        spy1.calledOnce.should.be.true;
        spy1.calledWith(expectedLogs, 'ID').should.be.true;
    });

    it('should add extra parms properly', () => {
        const extraParams = { key: 'value' };
        const spy = sinon.spy();

        const logger = new Logster({
            url: 'http://mock/log',
            maxBufferLength: 1,
            __send__: spy,
            sessionIdRequired: false,
        });

        expect(() => logger.setExtraParams()).to.throw();

        logger.setExtraParams('somekey', extraParams);

        logger.report('info', ACTION1, STATE);

        const expectedLogs = [{
            timestamp: Date.now(), // fake time
            extra: { somekey: extraParams },
            state: {},
            level: 'info',
            action: ACTION1,
        }];
        spy.calledOnce.should.be.true;
        spy.calledWith(expectedLogs).should.be.true;
    });

    it('should unset session id', () => {
        const logger = new Logster({
            url: 'http://mock/log',
            maxBufferLength: 1,
        });

        logger.setSessionId('fsdg234');
        logger.sessionId.should.not.be.a('undefined');
        logger.unsetSessionId();

        expect(logger.sessionId).to.be.a('undefined');
    });

    it('should add filters properly', () => {
        const logger = new Logster({
            url: 'http://mock/log',
            maxBufferLength: 18,
        });
        logger.setActionFilter(() => null);

        logger.report('info', ACTION1, STATE);
        logger.report('info', ACTION2, STATE);

        let expectedBuffer = [];
        logger.buffer.getBuffer().should.be.eql(expectedBuffer);

        logger.setActionFilter(f => f);
        logger.setStateFilter(f => f);

        logger.report('info', ACTION1, STATE);
        logger.report('info', ACTION2, STATE);
        expectedBuffer = [{
            timestamp: Date.now(), // fake time
            extra: {},
            state: STATE,
            level: 'info',
            action: ACTION1,
        }, {
            timestamp: Date.now(),
            extra: {},
            state: STATE,
            level: 'info',
            action: ACTION2,
        }];

        logger.buffer.getBuffer().should.be.eql(expectedBuffer);
    });
});
