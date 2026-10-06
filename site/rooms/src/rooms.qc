/*
  THE ROOMS - tormentor logic (original QuakeC, GPL2 like the rest of this progs tree)

  info_tormentor : unseen voice. When a player exists it waits a beat, then reads
  wh_l0, wh_l1, ... (cvars filled by the hosting page from the relay) as centerprint
  subtitles, printing a "RELAY:say text|valence|dose" marker line on the console for
  the page's JS to turn into speech. When the last line has been read it fires its
  target (the ledger door). A func_button targeting it before then is refused.
*/
string(string s) cvar_string = #448;
float(string s) strlen = #114;
string(string a, optional string b, optional string c, optional string d, optional string e, optional string f) strcat = #115;
#ifndef __QW__
float(string s) stof = #81;
#endif

float TORM_WAIT = 0;
float TORM_READING = 1;
float TORM_DONE = 2;

void() tormentor_think;

string(float i) torm_cvar =
{
	return strcat("wh_l", ftos(i));
};

void(string line, string val, string dose) torm_say =
{
	local entity p;
	p = find(world, classname, "player");
	if (p)
		centerprint(p, line);
	// marker line: the page hooks stdout and speaks it
	bprint_e(strcat("RELAY:say ", line, "|", val, "|", dose, "\n"));
};

void() tormentor_think =
{
	local string line, val, dose;
	local entity pl, oself;

	if (self.state == TORM_WAIT)
	{
		if (!find(world, classname, "player"))
		{
			self.nextthink = time + 0.2;
			return;
		}
		// the subject is unarmed and cannot be hurt: this is a test, not a fight
		pl = find(world, classname, "player");
		pl.items = 0; pl.weapon = 0; pl.ammo_shells = 0; pl.ammo_nails = 0;
		pl.ammo_rockets = 0; pl.ammo_cells = 0; pl.armorvalue = 0;
		pl.takedamage = DAMAGE_NO;
		oself = self; self = pl; W_SetCurrentAmmo(); self = oself;
		stuffcmd(pl, "scr_centertime 8\nviewsize 120\n");
		self.state = TORM_READING;
		self.cnt = 0;
		self.nextthink = time + 2.5;	// let the room arrive first
		return;
	}

	if (self.state == TORM_READING)
	{
		line = cvar_string(torm_cvar(self.cnt));
		if (line == "" && self.cnt == 0)
			line = "There is a door. It is not locked. I am only not opening it.";
		if (line == "")
		{
			self.state = TORM_DONE;
			torm_say("THE DOOR IS OPEN. WALK.", "calm", "1");
			activator = find(world, classname, "player");
			SUB_UseTargets();
			return;
		}
		val = cvar_string(strcat("wh_v", ftos(self.cnt)));
		dose = cvar_string(strcat("wh_d", ftos(self.cnt)));
		if (val == "") val = "pain";
		if (dose == "") dose = "4";
		torm_say(line, val, dose);
		self.cnt = self.cnt + 1;
		// reading time: the tuned voice speaks ~7 chars/sec; JS queues audio so it never overlaps
		self.nextthink = time + 1.5 + strlen(line) * 0.14;
	}
};

void() tormentor_use =
{
	local entity p;
	p = find(world, classname, "player");
	if (self.state == TORM_DONE)
		torm_say("You pressed it. Of course you pressed it.", "pain", "3");
	else if (p)
		torm_say("Not yet. I am still reading.", "pain", "3");
};

void() info_tormentor =
{
	self.state = TORM_WAIT;
	self.think = tormentor_think;
	self.use = tormentor_use;
	self.nextthink = time + 0.5;
};
