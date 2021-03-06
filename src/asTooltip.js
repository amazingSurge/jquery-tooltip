import $ from 'jquery';
import DEFAULTS from './defaults';

const NAMESPACE = 'asTooltip';

const $win = $(window);
const instances = [];

// this is the core function to compute the position to show depended on the given placement argument
const computePlacementOffset = (element, $tip, position, isMove) => {
  // grab measurements
  let elOffset;

  let elWidth;
  let elHeight;
  let tipWidth;
  let tipHeight;
  const $element = $(element);
  let x = 0;
  let y = 0;

  elOffset = isMove ? element : $element.offset();
  elWidth = isMove ? 0 : $element.outerWidth();
  elHeight = isMove ? 0 : $element.outerHeight();

  tipWidth = $tip.outerWidth();
  tipHeight = $tip.outerHeight();

  for (let i = 0; i < position.length; i++) {
    switch (position[i]) {
      case 'left':
        x = i === 0 ? elOffset.left - tipWidth : elOffset.left;
        break;
      case 'middle':
        switch (position[0]) {
          case 'left':
          case 'right':
            y = elOffset.top + (elHeight - tipHeight) / 2;
            break;
          case 'top':
          case 'bottom':
            x = elOffset.left + (elWidth - tipWidth) / 2;
            break;
          default:
            break;
        }
        break;
      case 'right':
        x = i === 0 ? elOffset.left + elWidth : elOffset.left + elWidth - tipWidth;
        break;
      case 'top':
        y = i === 0 ? elOffset.top - tipHeight : elOffset.top;
        break;
      case 'bottom':
        y = i === 0 ? elOffset.top + elHeight : elOffset.top + elHeight - tipHeight;
        break;
      default:
        break;
    }
  }

  return {
    left: Math.round(x),
    top: Math.round(y)
  };
};

const getViewportCollisions = (el, $tip, $container) => {
  const $element = $(el);
  const eOffset = $element.offset();
  const cOffset = $container.offset();
  const scrollLeft = $container[0].tagName === 'BODY' ? $win.scrollLeft() : $container.scrollLeft();
  const scrollTop = $container[0].tagName === 'BODY' ? $win.scrollTop() : $container.scrollTop();

  const offset = $container[0].tagName === 'BODY' ? eOffset : {
    top: eOffset.top - cOffset.top,
    left: eOffset.left - cOffset.left
  };

  const eWidth = $element.outerWidth();
  const eHeight = $element.outerHeight();
  const tWidth = $tip.outerWidth();
  const tHeight = $tip.outerHeight();
  const cWidth = $container[0].tagName === 'BODY' ? $win.innerWidth() : $container.outerWidth();
  const cHeight = $container[0].tagName === 'BODY' ? $win.innerHeight() : $container.outerHeight();
  const collisions = [];

  if (tHeight > offset.top - scrollTop) {
    collisions.push('top');
  }
  if (tHeight + eHeight + offset.top > scrollTop + cHeight) {
    collisions.push('bottom');
  }
  if (tWidth > offset.left - scrollLeft) {
    collisions.push('left');
  }
  if (tWidth + eWidth + offset.left > scrollLeft + cWidth) {
    collisions.push('right');
  }

  return collisions;
};

/**
 * Plugin constructor
 **/
class asTooltip {
  constructor(element, options) {
    const body = $(document.body);
    const newTarget = element[0] === document ? body : element;
    let opts;
    let targetData;
    targetData = this.parseTargetData($(newTarget).data());
    opts = this.options = $.extend(true, {}, DEFAULTS, options, targetData);

    opts.position.container = !opts.position.container ? body : $(opts.position.container);
    if (!opts.position.target) {
      opts.position.target = newTarget;
    }
    if (!opts.show.target) {
      opts.show.target = newTarget;
    }
    if (!opts.hide.target) {
      opts.hide.target = newTarget;
    }

    this.$element = $(newTarget);

    this.namespace = this.options.namespace;
    opts.content = this.getContent();

    this.enabled = true;
    this.isOpen = false;
    this.loadFlag = false;
    this.moveFlag = false;
    this.showTimer = null;
    this.hideTimer = null;

    this.classes = {
      show: `${this.namespace}_isShow`,
      isLoading: `${this.namespace}_isLoading`,
      active: `${this.namespace}_active`,
      enabled: `${this.namespace}_enabled`,
    };

    this.trigger('init');
    this.init();
  }

  init() {
    const opts = this.options;
    const showTarget = opts.show.target;
    const hideTarget = opts.hide.target;
    const showEvent = opts.show.event;
    const hideEvent = opts.hide.event;

    // add namepace
    this.$tip = $(opts.tpl.replace(/{{namespace}}/g, this.namespace));

    this.$loading = $(`.${this.namespace}-loading`, this.$tip);
    this.$content = $(`.${this.namespace}-content`, this.$tip);

    if (showTarget === hideTarget && showEvent === hideEvent) {
      this._bind(showTarget, showEvent, (e) => {
        if(this.isOpen){
          this.hideMethod(e);
        } else {
          this.showMethod(e);
        }
      });
    } else {
      this._bind(showTarget, showEvent, (e) => {
        this.showMethod(e);
      });
      this._bind(hideTarget, hideEvent, (e) => {
        this.hideMethod(e);
      });
    }
    if (opts.position.container[0].tagName === 'BODY') {
      if (opts.position.adjust.resize) {
        this._bind($win, 'resize', () => {
          if (this.isOpen) {
            this.setPosition();
          }
        });
      }
      if (opts.position.adjust.scroll) {
        this._bind($win, 'scroll', () => {
          if (this.isOpen) {
            this.setPosition();
          }
        });
      }
    }
  }

  trigger(eventType, ...params) {
    let data = [this].concat(params);

    // event
    this.$element.trigger(`${NAMESPACE}::${eventType}`, data);

    // callback
    eventType = eventType.replace(/\b\w+\b/g, (word) => {
      return word.substring(0, 1).toUpperCase() + word.substring(1);
    });
    let onFunction = `on${eventType}`;

    if (typeof this.options[onFunction] === 'function') {
      this.options[onFunction].apply(this, params);
    }
  }

  _bind(targets, events, method, suffix) {
    if (!targets || !method || !events.length) {
      return;
    }
    const name = suffix ? events : `${events}.${suffix}`;
    $(targets).on(name, $.proxy(method, this));
    return this;
  }

  _unbind(targets, events, suffix) {
    if(targets) {
      $(targets).unbind(suffix ? events : `${events}.${suffix}`);
    }
    return this;
  }

  parseTargetData(data) {
    const targetData = {};
    $.each(data, (n, v) => {
      const names = n.split('_');
      const len = names.length;
      let path = targetData;
      if (len === 1) {
        targetData[names[0]] = v;
      } else {
        for (let i = 0; i < len; i++) {
          if (i === 0) {
            if (targetData[names[i]] === undefined) {
              targetData[names[i]] = {};
            }
          } else if (i === len - 1) {
            path[names[i]] = v;
          } else {
            if (path[names[i]] === undefined) {
              path[names[i]] = {};
            }
          }
          path = targetData[names[i]];
        }
      }
    });
    return targetData;
  }

  parseTpl(string) {
    return string.replace('{{namespace}}', self.namespace);
  }

  getDelegateOptions() {
    const options = {};

    if(this._options){
      $.each(this._options, (key, value) => {
        if (DEFAULTS[key] !== value) {
          options[key] = value;
        }
      });
    }

    return options;
  }

  showMethod(obj) {
    let self = obj instanceof this.constructor ? obj: $(obj.currentTarget).data(NAMESPACE);
    const opts = this.options;

    if (!self) {
      self = new this.constructor(obj.currentTarget, this.getDelegateOptions());
      $(obj.currentTarget).data(NAMESPACE, self);
    }

    if (!opts.ajax && !self.options.content) {
      return;
    }

    if (self.isOpen) {
      clearTimeout(self.hideTimer);
    } else {
      clearTimeout(self.showTimer);
      self.showTimer = setTimeout(() => {
        $.proxy(self.show, self)();
      }, opts.show.delay);
    }

    if (opts.position.target === 'mouse') {
      if (this.moveFlag) {
        return;
      }
      this.isFirst = true;
      $(document).on(`mousemove.${NAMESPACE}`, $.proxy(this.move, self));
      this.moveFlag = true;
    }

    if (opts.hide.event === 'click') {
      if (opts.hide.container) {
        this._bind(opts.hide.container, opts.hide.event, e => {
          const $target = $(e.target);

          if ($target.closest(self.$el).length === 0 && $target.closest(self.$tip).length === 0) {
            if (self.isOpen) {
              $.proxy(self.hide, self)();
            }
          }
        });
      }
    }
  }

  hideMethod(obj) {
    let self = obj instanceof this.constructor ? obj : $(obj.currentTarget).data(NAMESPACE);
    const opts = this.options;
    let show = false;

    if (!self) {
      self = new this.constructor(obj.currentTarget, this.getDelegateOptions());
      $(obj.currentTarget).data(NAMESPACE, self);
    }

    if (!opts.ajax && !self.options.content) {
      return;
    }

    if (!self.isOpen) {
      clearTimeout(self.showTimer);
      return;
    }

    if (opts.position.target === 'mouse') {
      if (this.moveFlag) {
        return;
      }
    }

    if (opts.hide.event === 'click') {
      if (opts.hide.container) {
        this._unbind(opts.hide.container, opts.hide.event);
      }
    }

    if (opts.hide.inactive) {
      this._bind(self.$tip, `mouseenter.${NAMESPACE}`, () => {
        show = true;
      });
      this._bind(self.$tip, `mouseleave.${NAMESPACE}`, () => {
        show = false;
        clearTimeout(self.hideTimer);
        self.hideTimer = setTimeout(() => {
          $.proxy(self.hide, self)();
        }, self.options.hide.delay);

        self._unbind(self.$tip, `mouseenter.${NAMESPACE} mouseleave.${NAMESPACE}`);
      });
    }

    clearTimeout(self.hideTimer);

    self.hideTimer = setTimeout(() => {
      if (!show) {
        $.proxy(self.hide, self)();
      }
    }, opts.hide.delay);
  }

  move(e) {
    const x = Math.round(e.pageX);
    const y = Math.round(e.pageY);
    const t = this.$element.offset().top;
    const l = this.$element.offset().left;
    const w = this.$element.outerWidth();
    const h = this.$element.outerHeight();

    if (x >= l && x <= l + w && y >= t && y <= t + h) {
      if (this.options.position.adjust.mouse) {
        this.setPosition(e);
      } else if (this.isFirst) {
        this.setPosition(e);
        this.isFirst = false;
      }
    } else {
      $(document).off(`mousemove.${NAMESPACE}`);
      this.moveFlag = false;
      this.hideMethod(this.$element.data(NAMESPACE));
    }
  }

  getContent() {
    return this.$element.attr(this.options.contentAttr) ||
      (typeof this.options.content === 'function' ? this.options.content() : this.options.content);
  }

  setPosition(e) {
    let offset;
    let _offset;
    let positionAttr;
    const opts = this.options;
    let target = this.$el;
    const $container = opts.position.container;
    let flag = false;
    let isMove = false;

    positionAttr = $container.css('position');

    const position = opts.position.value.split(' ');

    if (opts.position.target === 'mouse' && e) {
      target = {
        top: Math.round(e.pageY),
        left: Math.round(e.pageX)
      };
      isMove = true;
    } else {
      if (typeof opts.position.target === 'object') {
        target = opts.position.target;
      }
    }

    if (opts.position.auto) {
      if (opts.position.target !== 'mouse') {
        const collisions = getViewportCollisions(target, this.$tip, $container);
        let posArr = ['top', 'right', 'bottom', 'left'];
        $.each(collisions, (i, v) => {
          posArr = $.map(posArr, n => n !== v ? n : null);
        });
        if (posArr.length > 0) {
          position[0] = posArr[0];
        }
      }
    }

    this.$tip.addClass(`${this.namespace}-element-${position[0]}`)
      .addClass(`${this.namespace}-arrow-${position[1]}`);

    offset = computePlacementOffset(target, this.$tip, position, isMove);

    if (positionAttr !== 'static') {
      _offset = $container.offset();
      flag = true;
    }

    this.$tip.css({
      top: offset.top + (flag ? -_offset.top : 0),
      left: offset.left + (flag ? -_offset.left : 0)
    });
  }

  loadToggle() {
    const flag = this.loadFlag;
    if (flag) {
      this.$tip.removeClass(`${this.namespace}_isLoading`);
      this.loadFlag = false;
    } else {
      this.$tip.addClass(`${this.namespace}_isLoading`);
      this.loadFlag = true;
    }
  }

  statusToggle(isOpen) {
    if (isOpen) {
      this.$element.removeClass(this.classes.active);
    } else {
      this.$element.addClass(this.classes.active);
    }
  }

  /*
   *  Public Method
   */
  rePosition(e) {
    this.setPosition(e);
    return this;
  }

  setContent() {
    const opts = this.options;

    if (opts.ajax) {
      this.loadToggle();
    }

    this.$content.html(opts.content);
    this.$tip.appendTo(opts.position.container);

    if (opts.position.target !== 'mouse') {
      this.setPosition();
    }
  }

  show() {
    const opts = this.options;

    if (!this.enabled) {
      return;
    }

    // if (opts.closeBtn) this.$tip.addClass(this.classes.hasClose);

    if (opts.skin) {
      this.$tip.addClass(`${this.namespace}_${opts.skin}`);
    }

    if (opts.ajax) {
      opts.ajax(this);
    }

    this.setContent(this.isOpen);
    this.statusToggle(this.isOpen);

    this.isOpen = true;
    this.trigger('show');
    return this;
  }

  hide() {
    if (this.options.ajax) {
      this.$tip.removeClass(`${this.namespace}_isLoading`);
      this.loadFlag = false;
    }
    this.$tip.off(`.${NAMESPACE}`);
    this.statusToggle(this.isOpen);
    this.$tip.remove();
    this.isOpen = false;
    this.trigger('hide');
    return this;
  }

  enable() {
    this.enabled = true;
    this.$element.addClass(this.classes.enabled);
    this.trigger('enable');
    return this;
  }

  disable() {
    this.enabled = false;
    this.$element.removeClass(this.classes.enabled);
    this.trigger('disable');
    return this;
  }

  destroy() {
    this.$element.off(`.${NAMESPACE}`);
    this.trigger('destroy');
    return this;
  }

  static closeAll() {
    instances.map(instance => {
      if (instance.isOpen) {
        instance.hide();
      }
    });
  }

  static setDefaults(options) {
    if($.isPlainObject(options)) {
      $.extend(true, DEFAULTS, options);
    }
  }
}

export default asTooltip;
