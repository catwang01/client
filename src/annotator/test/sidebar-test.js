import events from '../../shared/bridge-events';

import Delegator from '../delegator';
import Sidebar, { MIN_RESIZE } from '../sidebar';
import { $imports } from '../sidebar';

const DEFAULT_WIDTH = 350;
const DEFAULT_HEIGHT = 600;
const EXTERNAL_CONTAINER_SELECTOR = 'test-external-container';

describe('Sidebar', () => {
  const sandbox = sinon.createSandbox();
  let fakeCrossFrame;
  let fakeGuest;

  // Containers and Sidebar instances created by current test.
  let containers;
  let sidebars;

  let FakeToolbarController;
  let fakeBucketBar;
  let fakeToolbar;

  before(() => {
    sinon.stub(window, 'requestAnimationFrame').yields();
  });

  after(() => {
    window.requestAnimationFrame.restore();
  });

  const createSidebar = (config = {}) => {
    config = Object.assign(
      {
        // Dummy sidebar app.
        sidebarAppUrl: '/base/annotator/test/empty.html',
      },
      config
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    containers.push(container);

    const sidebar = new Sidebar(container, config, fakeGuest);
    sidebars.push(sidebar);

    return sidebar;
  };

  const createExternalContainer = () => {
    const externalFrame = document.createElement('div');
    document.body.appendChild(externalFrame);
    containers.push(externalFrame);

    externalFrame.className = EXTERNAL_CONTAINER_SELECTOR;
    externalFrame.style.width = DEFAULT_WIDTH + 'px';
    externalFrame.style.height = DEFAULT_HEIGHT + 'px';

    return externalFrame;
  };

  beforeEach(() => {
    sidebars = [];
    containers = [];
    fakeCrossFrame = {
      on: sandbox.stub(),
      call: sandbox.stub(),
    };

    class FakeGuest extends Delegator {
      constructor() {
        const element = document.createElement('div');
        super(element, {});

        this.createAnnotation = sinon.stub();
        this.crossframe = fakeCrossFrame;
        this.setVisibleHighlights = sinon.stub();
      }
    }
    fakeGuest = new FakeGuest();

    fakeToolbar = {
      getWidth: sinon.stub().returns(100),
      useMinimalControls: false,
      sidebarOpen: false,
      newAnnotationType: 'note',
      highlightsVisible: false,
      sidebarToggleButton: document.createElement('button'),
    };
    FakeToolbarController = sinon.stub().returns(fakeToolbar);

    fakeBucketBar = {
      destroy: sinon.stub(),
      update: sinon.stub(),
    };
    const BucketBar = sandbox.stub().returns(fakeBucketBar);

    sidebars = [];

    $imports.$mock({
      './toolbar': {
        ToolbarController: FakeToolbarController,
      },
      './bucket-bar': { default: BucketBar },
    });
  });

  afterEach(() => {
    sidebars.forEach(s => s.destroy());
    containers.forEach(c => c.remove());
    sandbox.restore();
    $imports.$restore();
  });

  describe('sidebar container frame', () => {
    it('creates shadow DOM', () => {
      createSidebar();
      const sidebarContainer = containers[0];
      const sidebar = sidebarContainer.querySelector('hypothesis-sidebar');
      assert.exists(sidebar);
      assert.exists(sidebar.shadowRoot);
    });

    it('starts hidden', () => {
      const sidebar = createSidebar();
      assert.equal(sidebar.iframeContainer.style.display, 'none');
    });

    it('applies a style if theme is configured as "clean"', () => {
      const sidebar = createSidebar({ theme: 'clean' });
      assert.isTrue(
        sidebar.iframeContainer.classList.contains(
          'annotator-frame--theme-clean'
        )
      );
    });

    it('becomes visible when the "panelReady" event fires', () => {
      const sidebar = createSidebar();
      sidebar.publish('panelReady');
      assert.equal(sidebar.iframeContainer.style.display, '');
    });
  });

  function getConfigString(sidebar) {
    return sidebar.iframe.src;
  }

  function configFragment(config) {
    return '#config=' + encodeURIComponent(JSON.stringify(config));
  }

  it('creates sidebar iframe and passes configuration to it', () => {
    const appURL = new URL(
      '/base/annotator/test/empty.html',
      window.location.href
    );
    const sidebar = createSidebar({ annotations: '1234' });
    assert.equal(
      getConfigString(sidebar),
      appURL + configFragment({ annotations: '1234' })
    );
  });

  context('when a new annotation is created', () => {
    function stubIframeWindow(sidebar) {
      const iframe = sidebar.iframe;
      const fakeIframeWindow = { focus: sinon.stub() };
      sinon.stub(iframe, 'contentWindow').get(() => fakeIframeWindow);
      return iframe;
    }

    it('focuses the sidebar if the annotation is not a highlight', () => {
      const sidebar = createSidebar();
      const iframe = stubIframeWindow(sidebar);

      sidebar.publish('beforeAnnotationCreated', [
        {
          $highlight: false,
        },
      ]);

      assert.called(iframe.contentWindow.focus);
    });

    it('does not focus the sidebar if the annotation is a highlight', () => {
      const sidebar = createSidebar();
      const iframe = stubIframeWindow(sidebar);

      sidebar.publish('beforeAnnotationCreated', [
        {
          $highlight: true,
        },
      ]);

      assert.notCalled(iframe.contentWindow.focus);
    });
  });

  describe('toolbar buttons', () => {
    it('shows or hides sidebar when toolbar button is clicked', () => {
      const sidebar = createSidebar();
      sinon.stub(sidebar, 'show');
      sinon.stub(sidebar, 'hide');

      FakeToolbarController.args[0][1].setSidebarOpen(true);
      assert.called(sidebar.show);

      FakeToolbarController.args[0][1].setSidebarOpen(false);
      assert.called(sidebar.hide);
    });

    it('shows or hides highlights when toolbar button is clicked', () => {
      const sidebar = createSidebar();
      sinon.stub(sidebar, 'setAllVisibleHighlights');

      FakeToolbarController.args[0][1].setHighlightsVisible(true);
      assert.calledWith(sidebar.setAllVisibleHighlights, true);
      sidebar.setAllVisibleHighlights.resetHistory();

      FakeToolbarController.args[0][1].setHighlightsVisible(false);
      assert.calledWith(sidebar.setAllVisibleHighlights, false);
    });

    it('creates an annotation when toolbar button is clicked', () => {
      const sidebar = createSidebar();

      FakeToolbarController.args[0][1].createAnnotation();

      assert.called(sidebar.guest.createAnnotation);
    });

    it('sets create annotation button to "Annotation" when selection becomes non-empty', () => {
      const sidebar = createSidebar();

      // nb. This event is normally published by the Guest, but the sidebar
      // doesn't care about that.
      sidebar.publish('hasSelectionChanged', [true]);

      assert.equal(sidebar.toolbar.newAnnotationType, 'annotation');
    });

    it('sets create annotation button to "Page Note" when selection becomes empty', () => {
      const sidebar = createSidebar();

      // nb. This event is normally published by the Guest, but the sidebar
      // doesn't care about that.
      sidebar.publish('hasSelectionChanged', [false]);

      assert.equal(sidebar.toolbar.newAnnotationType, 'note');
    });
  });

  describe('crossframe listeners', () => {
    const emitEvent = (event, ...args) => {
      const result = [];
      for (let [evt, fn] of fakeCrossFrame.on.args) {
        if (event === evt) {
          result.push(fn(...args));
        }
      }
      return result;
    };

    describe('on "show" event', () =>
      it('shows the frame', () => {
        const target = sandbox.stub(Sidebar.prototype, 'show');
        createSidebar();
        emitEvent('showSidebar');
        assert.called(target);
      }));

    describe('on "hide" event', () =>
      it('hides the frame', () => {
        const target = sandbox.stub(Sidebar.prototype, 'hide');
        createSidebar();
        emitEvent('hideSidebar');
        assert.called(target);
      }));

    describe('on "showNotebook" event', () => {
      it('hides itself and republishes the event', () => {
        const sidebar = createSidebar();
        sinon.stub(sidebar, 'publish');
        sinon.stub(sidebar, 'hide');
        emitEvent('showNotebook', 'mygroup');
        assert.calledWith(
          sidebar.publish,
          'showNotebook',
          sinon.match(['mygroup'])
        );
        assert.calledOnce(sidebar.hide);
      });
    });

    describe('on "hideNotebook" event', () => {
      it('shows itself and republishes the event', () => {
        const sidebar = createSidebar();
        sinon.stub(sidebar, 'publish');
        sinon.stub(sidebar, 'show');
        emitEvent('hideNotebook');
        assert.calledWith(sidebar.publish, 'hideNotebook');
        assert.calledOnce(sidebar.show);
      });
    });

    describe('on LOGIN_REQUESTED event', () => {
      it('calls the onLoginRequest callback function if one was provided', () => {
        const onLoginRequest = sandbox.stub();
        createSidebar({ services: [{ onLoginRequest }] });

        emitEvent(events.LOGIN_REQUESTED);

        assert.called(onLoginRequest);
      });

      it('only calls the onLoginRequest callback of the first service', () => {
        // Even though config.services is an array it only calls the onLoginRequest
        // callback function of the first service. The onLoginRequests of any other
        // services are ignored.
        const firstOnLogin = sandbox.stub();
        const secondOnLogin = sandbox.stub();
        const thirdOnLogin = sandbox.stub();
        createSidebar({
          services: [
            { onLoginRequest: firstOnLogin },
            { onLoginRequest: secondOnLogin },
            { onLoginRequest: thirdOnLogin },
          ],
        });

        emitEvent(events.LOGIN_REQUESTED);

        assert.called(firstOnLogin);
        assert.notCalled(secondOnLogin);
        assert.notCalled(thirdOnLogin);
      });

      it('never calls the onLoginRequest callbacks of further services', () => {
        // Even if the first service doesn't have an onLoginRequest, it still doesn't
        // call the onLoginRequests of further services.
        const secondOnLogin = sandbox.stub();
        const thirdOnLogin = sandbox.stub();
        createSidebar({
          services: [
            {},
            { onLoginRequest: secondOnLogin },
            { onLoginRequest: thirdOnLogin },
          ],
        });

        emitEvent(events.LOGIN_REQUESTED);

        assert.notCalled(secondOnLogin);
        assert.notCalled(thirdOnLogin);
      });

      it('does not crash if there is no services', () => {
        createSidebar(); // No config.services
        emitEvent(events.LOGIN_REQUESTED);
      });

      it('does not crash if services is an empty array', () => {
        createSidebar({ services: [] });
        emitEvent(events.LOGIN_REQUESTED);
      });

      it('does not crash if the first service has no onLoginRequest', () => {
        createSidebar({ services: [{}] });
        emitEvent(events.LOGIN_REQUESTED);
      });
    });

    describe('on LOGOUT_REQUESTED event', () =>
      it('calls the onLogoutRequest callback function', () => {
        const onLogoutRequest = sandbox.stub();
        createSidebar({ services: [{ onLogoutRequest }] });

        emitEvent(events.LOGOUT_REQUESTED);

        assert.called(onLogoutRequest);
      }));

    describe('on SIGNUP_REQUESTED event', () =>
      it('calls the onSignupRequest callback function', () => {
        const onSignupRequest = sandbox.stub();
        createSidebar({ services: [{ onSignupRequest }] });

        emitEvent(events.SIGNUP_REQUESTED);

        assert.called(onSignupRequest);
      }));

    describe('on PROFILE_REQUESTED event', () =>
      it('calls the onProfileRequest callback function', () => {
        const onProfileRequest = sandbox.stub();
        createSidebar({ services: [{ onProfileRequest }] });

        emitEvent(events.PROFILE_REQUESTED);

        assert.called(onProfileRequest);
      }));

    describe('on HELP_REQUESTED event', () =>
      it('calls the onHelpRequest callback function', () => {
        const onHelpRequest = sandbox.stub();
        createSidebar({ services: [{ onHelpRequest }] });

        emitEvent(events.HELP_REQUESTED);

        assert.called(onHelpRequest);
      }));
  });

  describe('pan gestures', () => {
    let sidebar;

    beforeEach(() => {
      sidebar = createSidebar();
    });

    describe('panstart event', () => {
      it('disables pointer events and transitions on the widget', () => {
        sidebar._onPan({ type: 'panstart' });

        assert.isTrue(
          sidebar.iframeContainer.classList.contains('annotator-no-transition')
        );
        assert.equal(sidebar.iframeContainer.style.pointerEvents, 'none');
      });

      it('captures the left margin as the gesture initial state', () => {
        sandbox
          .stub(window, 'getComputedStyle')
          .returns({ marginLeft: '100px' });
        sidebar._onPan({ type: 'panstart' });
        assert.equal(sidebar._gestureState.initial, '100');
      });
    });

    describe('panend event', () => {
      it('enables pointer events and transitions on the widget', () => {
        sidebar._gestureState = { final: 0 };
        sidebar._onPan({ type: 'panend' });
        assert.isFalse(
          sidebar.iframeContainer.classList.contains('annotator-no-transition')
        );
        assert.equal(sidebar.iframeContainer.style.pointerEvents, '');
      });

      it('calls `show` if the widget is fully visible', () => {
        sidebar._gestureState = { final: -500 };
        const show = sandbox.stub(sidebar, 'show');
        sidebar._onPan({ type: 'panend' });
        assert.calledOnce(show);
      });

      it('calls `hide` if the widget is not fully visible', () => {
        sidebar._gestureState = { final: -100 };
        const hide = sandbox.stub(sidebar, 'hide');
        sidebar._onPan({ type: 'panend' });
        assert.calledOnce(hide);
      });
    });

    describe('panleft and panright events', () =>
      it('shrinks or grows the widget to match the delta', () => {
        sidebar._gestureState = { initial: -100 };

        sidebar._onPan({ type: 'panleft', deltaX: -50 });
        assert.equal(sidebar._gestureState.final, -150);

        sidebar._onPan({ type: 'panright', deltaX: 100 });
        assert.equal(sidebar._gestureState.final, 0);
      }));
  });

  describe('panelReady event', () => {
    it('opens the sidebar when a direct-linked annotation is present.', () => {
      const sidebar = createSidebar({
        annotations: 'ann-id',
      });
      const show = sandbox.stub(sidebar, 'show');
      sidebar.publish('panelReady');
      assert.calledOnce(show);
    });

    it('opens the sidebar when a direct-linked group is present.', () => {
      const sidebar = createSidebar({
        group: 'group-id',
      });
      const show = sandbox.stub(sidebar, 'show');
      sidebar.publish('panelReady');
      assert.calledOnce(show);
    });

    it('opens the sidebar when a direct-linked query is present.', () => {
      const sidebar = createSidebar({
        query: 'tag:foo',
      });
      const show = sandbox.stub(sidebar, 'show');
      sidebar.publish('panelReady');
      assert.calledOnce(show);
    });

    it('opens the sidebar when openSidebar is set to true.', () => {
      const sidebar = createSidebar({
        openSidebar: true,
      });
      const show = sandbox.stub(sidebar, 'show');
      sidebar.publish('panelReady');
      assert.calledOnce(show);
    });

    it('does not show the sidebar if not configured to.', () => {
      const sidebar = createSidebar();
      const show = sandbox.stub(sidebar, 'show');
      sidebar.publish('panelReady');
      assert.notCalled(show);
    });
  });

  describe('#destroy', () => {
    it('removes sidebar DOM elements', () => {
      const sidebar = createSidebar();
      const sidebarContainer = containers[0];

      sidebar.destroy();

      assert.notExists(sidebarContainer.querySelector('hypothesis-sidebar'));
      assert.equal(sidebar.iframeContainer.parentElement, null);
    });

    it('cleans up bucket bar', () => {
      const sidebar = createSidebar();
      sidebar.destroy();
      assert.called(sidebar.bucketBar.destroy);
    });
  });

  describe('#show', () => {
    it('shows highlights if "showHighlights" is set to "whenSidebarOpen"', () => {
      const sidebar = createSidebar({ showHighlights: 'whenSidebarOpen' });
      sidebar.show();
      assert.calledWith(sidebar.guest.setVisibleHighlights, true);
    });

    it('does not show highlights otherwise', () => {
      const sidebar = createSidebar({ showHighlights: 'never' });
      sidebar.show();
      assert.notCalled(sidebar.guest.setVisibleHighlights);
    });

    it('updates the `sidebarOpen` property of the toolbar', () => {
      const sidebar = createSidebar();
      sidebar.show();
      assert.equal(fakeToolbar.sidebarOpen, true);
    });
  });

  describe('#hide', () => {
    it('hides highlights if "showHighlights" is set to "whenSidebarOpen"', () => {
      const sidebar = createSidebar({ showHighlights: 'whenSidebarOpen' });

      sidebar.show();
      sidebar.hide();

      assert.calledWith(sidebar.guest.setVisibleHighlights, false);
    });

    it('updates the `sidebarOpen` property of the toolbar', () => {
      const sidebar = createSidebar();

      sidebar.show();
      sidebar.hide();

      assert.equal(fakeToolbar.sidebarOpen, false);
    });
  });

  describe('#setAllVisibleHighlights', () =>
    it('sets the state through crossframe and emits', () => {
      const sidebar = createSidebar();
      sidebar.setAllVisibleHighlights(true);
      assert.calledWith(fakeCrossFrame.call, 'setVisibleHighlights', true);
    }));

  it('hides toolbar controls when using the "clean" theme', () => {
    createSidebar({ theme: 'clean' });
    assert.equal(fakeToolbar.useMinimalControls, true);
  });

  it('shows toolbar controls when using the default theme', () => {
    createSidebar();
    assert.equal(fakeToolbar.useMinimalControls, false);
  });

  describe('window resize events', () => {
    it('hides the sidebar if window width is < MIN_RESIZE', () => {
      const sidebar = createSidebar({ openSidebar: true });
      sidebar.publish('panelReady');

      window.innerWidth = MIN_RESIZE - 1;
      window.dispatchEvent(new Event('resize'));
      assert.equal(fakeToolbar.sidebarOpen, false);
    });

    it('invokes the "show" method when window is resized', () => {
      // Calling the 'show' methods adjust the marginLeft at different screen sizes
      const sidebar = createSidebar({ openSidebar: true });
      sidebar.publish('panelReady');
      sinon.stub(sidebar, 'show');

      // Make the window very small
      window.innerWidth = MIN_RESIZE;
      window.dispatchEvent(new Event('resize'));
      assert.calledOnce(sidebar.show);

      // Make the window very large
      window.innerWidth = MIN_RESIZE * 10;
      window.dispatchEvent(new Event('resize'));
      assert.calledTwice(sidebar.show);
    });
  });

  describe('register/unregister events', () => {
    it('triggers registered event listener', () => {
      const sidebar = createSidebar();
      const listener = sinon.stub();
      sidebar._registerEvent(window, 'resize', listener);

      window.dispatchEvent(new Event('resize'));
      assert.calledOnce(listener);
    });

    it('unregisters event listeners', () => {
      const sidebar = createSidebar();
      const listener = sinon.stub();
      sidebar._registerEvent(window, 'resize', listener);
      sidebar.destroy();

      window.dispatchEvent(new Event('resize'));
      assert.notCalled(listener);
    });
  });

  describe('layout change notifier', () => {
    let layoutChangeHandlerSpy;

    const assertLayoutValues = (args, expectations) => {
      const expected = Object.assign(
        {
          width: DEFAULT_WIDTH + fakeToolbar.getWidth(),
          height: DEFAULT_HEIGHT,
          expanded: true,
        },
        expectations
      );

      assert.deepEqual(args, expected);
    };

    describe('with the frame set up as default', () => {
      let sidebar;
      let frame;

      beforeEach(() => {
        layoutChangeHandlerSpy = sandbox.stub();
        sidebar = createSidebar({
          onLayoutChange: layoutChangeHandlerSpy,
          sidebarAppUrl: '/',
        });

        // remove info about call that happens on creation of sidebar
        layoutChangeHandlerSpy.reset();

        frame = sidebar.iframeContainer;
        Object.assign(frame.style, {
          display: 'block',
          width: DEFAULT_WIDTH + 'px',
          height: DEFAULT_HEIGHT + 'px',

          // width is based on left position of the window,
          // we need to apply the css that puts the frame in the
          // correct position
          position: 'fixed',
          top: 0,
          left: '100%',
        });

        document.body.appendChild(frame);
      });

      afterEach(() => {
        frame.remove();
      });

      it('notifies when sidebar changes expanded state', () => {
        sinon.stub(sidebar, 'publish');
        sidebar.show();
        assert.calledOnce(layoutChangeHandlerSpy);
        assert.calledWith(
          sidebar.publish,
          'sidebarLayoutChanged',
          sinon.match.any
        );
        assert.calledWith(sidebar.publish, 'sidebarOpened');
        assert.calledTwice(sidebar.publish);
        assertLayoutValues(layoutChangeHandlerSpy.lastCall.args[0], {
          expanded: true,
        });

        sidebar.hide();
        assert.calledTwice(layoutChangeHandlerSpy);
        assert.calledThrice(sidebar.publish);
        assertLayoutValues(layoutChangeHandlerSpy.lastCall.args[0], {
          expanded: false,
          width: fakeToolbar.getWidth(),
        });
      });

      it('notifies when sidebar is panned left', () => {
        sidebar._gestureState = { initial: -DEFAULT_WIDTH };
        sidebar._onPan({ type: 'panleft', deltaX: -50 });
        assertLayoutValues(layoutChangeHandlerSpy.lastCall.args[0], {
          width: DEFAULT_WIDTH + 50 + fakeToolbar.getWidth(),
        });
      });

      it('notifies when sidebar is panned right', () => {
        sidebar._gestureState = { initial: -DEFAULT_WIDTH };
        sidebar._onPan({ type: 'panright', deltaX: 50 });
        assertLayoutValues(layoutChangeHandlerSpy.lastCall.args[0], {
          width: DEFAULT_WIDTH - 50 + fakeToolbar.getWidth(),
        });
      });
    });

    describe('with the frame in an external container', () => {
      let sidebar;
      let externalFrame;

      beforeEach(() => {
        externalFrame = createExternalContainer();
        Object.assign(externalFrame.style, {
          display: 'block',
          width: DEFAULT_WIDTH + 'px',
          height: DEFAULT_HEIGHT + 'px',
          position: 'fixed',
          top: 0,
          left: 0,
        });

        layoutChangeHandlerSpy = sandbox.stub();
        const layoutChangeExternalConfig = {
          onLayoutChange: layoutChangeHandlerSpy,
          sidebarAppUrl: '/',
          externalContainerSelector: `.${EXTERNAL_CONTAINER_SELECTOR}`,
        };
        sidebar = createSidebar(layoutChangeExternalConfig);

        // remove info about call that happens on creation of sidebar
        layoutChangeHandlerSpy.reset();
      });

      afterEach(() => {
        externalFrame.remove();
      });

      it('notifies when sidebar changes expanded state', () => {
        sidebar.show();
        assert.calledOnce(layoutChangeHandlerSpy);
        assertLayoutValues(layoutChangeHandlerSpy.lastCall.args[0], {
          expanded: true,
          width: DEFAULT_WIDTH,
        });

        sidebar.hide();
        assert.calledTwice(layoutChangeHandlerSpy);
        assertLayoutValues(layoutChangeHandlerSpy.lastCall.args[0], {
          expanded: false,
          width: 0,
        });
      });

      it('removes the iframe from the container when destroyed', () => {
        sidebar.show();
        assert.exists(sidebar.iframe.parentElement);
        sidebar.destroy();
        assert.notExists(sidebar.iframe.parentElement);
      });

      it('ignores pan events', () => {
        sandbox
          .stub(window, 'getComputedStyle')
          .returns({ marginLeft: '100px' });
        sidebar._onPan({ type: 'panstart' });
        assert.isNull(sidebar._gestureState.initial);
      });
    });
  });

  describe('sidebar frame in an external container', () => {
    let sidebar;
    let externalFrame;

    beforeEach(() => {
      externalFrame = createExternalContainer();

      sidebar = createSidebar({
        externalContainerSelector: `.${EXTERNAL_CONTAINER_SELECTOR}`,
      });
    });

    afterEach(() => {
      externalFrame.remove();
    });

    it('uses the configured external container as the frame', () => {
      assert.equal(sidebar.iframeContainer, undefined);
      assert.isDefined(sidebar.externalFrame);
      assert.equal(sidebar.externalFrame, externalFrame);
      assert.equal(externalFrame.childNodes.length, 1);
    });
  });

  describe('bucket bar state', () => {
    it('displays the bucket bar by default', () => {
      const sidebar = createSidebar();
      assert.isNotNull(sidebar.bucketBar);
    });

    it('does not display the bucket bar if using the "clean" theme', () => {
      const sidebar = createSidebar({ theme: 'clean' });
      assert.isNull(sidebar.bucketBar);
    });

    it('does not display the bucket bar if using an external container for the sidebar', () => {
      const sidebar = createSidebar({
        externalContainerSelector: `.${EXTERNAL_CONTAINER_SELECTOR}`,
      });
      assert.isNull(sidebar.bucketBar);
    });

    it('updates the bucket bar when an `anchorsChanged` event is received', () => {
      const sidebar = createSidebar();

      fakeGuest.publish('anchorsChanged');

      assert.calledOnce(sidebar.bucketBar.update);
    });
  });
});
